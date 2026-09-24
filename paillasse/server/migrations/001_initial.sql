-- Paillasse — schéma initial (phase 0 + 1 : socle et cahier)
-- Chaque table porte created_by pour permettre le passage au multi-utilisateur.

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text NOT NULL UNIQUE,
  display_name  text NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  color       text NOT NULL DEFAULT '#2449C7',
  archived    boolean NOT NULL DEFAULT false,
  created_by  uuid NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  content     jsonb NOT NULL,
  archived    boolean NOT NULL DEFAULT false,
  created_by  uuid NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Une entrée = sa copie de travail (content) + son historique figé (entry_versions)
CREATE TABLE entries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id),
  parent_entry_id   uuid REFERENCES entries(id),          -- addendum d'une entrée verrouillée
  title             text NOT NULL,
  entry_date        date NOT NULL DEFAULT current_date,
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'locked')),
  content           jsonb NOT NULL,
  plain_text        text NOT NULL DEFAULT '',
  revision          integer NOT NULL DEFAULT 0,            -- verrou optimiste pour l'autosave
  version_count     integer NOT NULL DEFAULT 0,
  last_version_hash text,
  locked_at         timestamptz,
  locked_by         uuid REFERENCES users(id),
  archived          boolean NOT NULL DEFAULT false,
  created_by        uuid NOT NULL REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  search            tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('french'::regconfig, coalesce(title, '')), 'A') ||
    setweight(to_tsvector('french'::regconfig, coalesce(plain_text, '')), 'B')
  ) STORED
);
CREATE INDEX entries_search_idx  ON entries USING gin (search);
CREATE INDEX entries_project_idx ON entries (project_id, entry_date DESC, created_at DESC);
CREATE INDEX entries_date_idx    ON entries (entry_date DESC, created_at DESC);
CREATE INDEX entries_parent_idx  ON entries (parent_entry_id);

-- Versions figées, chaînées par hash (SHA-256)
CREATE TABLE entry_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id       uuid NOT NULL REFERENCES entries(id),
  version_number integer NOT NULL,
  kind           text NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual', 'lock')),
  note           text NOT NULL DEFAULT '',
  title          text NOT NULL,
  entry_date     date NOT NULL,
  content        jsonb NOT NULL,
  plain_text     text NOT NULL,
  created_by     uuid NOT NULL REFERENCES users(id),
  created_at     timestamptz NOT NULL,
  content_hash   text NOT NULL,
  prev_hash      text,
  hash           text NOT NULL,
  UNIQUE (entry_id, version_number)
);

-- Pièces jointes : le fichier est stocké sous son SHA-256 (DATA_DIR/blobs/ab/<sha256>)
CREATE TABLE attachments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id    uuid NOT NULL REFERENCES entries(id),
  sha256      text NOT NULL,
  filename    text NOT NULL,
  mime_type   text NOT NULL,
  size_bytes  bigint NOT NULL,
  created_by  uuid NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL
);
CREATE INDEX attachments_entry_idx ON attachments (entry_id, created_at);

-- Tables en ajout seul : toute modification ou suppression est refusée par la base elle-même
CREATE FUNCTION paillasse_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Table % en ajout seul : % interdit', TG_TABLE_NAME, TG_OP;
END $$;

CREATE TRIGGER entry_versions_append_only
  BEFORE UPDATE OR DELETE ON entry_versions
  FOR EACH ROW EXECUTE FUNCTION paillasse_append_only();

CREATE TRIGGER attachments_append_only
  BEFORE UPDATE OR DELETE ON attachments
  FOR EACH ROW EXECUTE FUNCTION paillasse_append_only();

-- Une entrée verrouillée ne peut plus changer de contenu
CREATE FUNCTION paillasse_locked_entry_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'locked' AND (
       NEW.content IS DISTINCT FROM OLD.content OR
       NEW.title IS DISTINCT FROM OLD.title OR
       NEW.entry_date IS DISTINCT FROM OLD.entry_date OR
       NEW.status IS DISTINCT FROM OLD.status OR
       NEW.last_version_hash IS DISTINCT FROM OLD.last_version_hash
     ) THEN
    RAISE EXCEPTION 'Entrée % verrouillée : modification interdite', OLD.id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER entries_locked_guard
  BEFORE UPDATE ON entries
  FOR EACH ROW EXECUTE FUNCTION paillasse_locked_entry_guard();

CREATE FUNCTION paillasse_forbid_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Les % ne se suppriment pas (utiliser archived)', TG_TABLE_NAME;
END $$;

CREATE TRIGGER entries_no_delete
  BEFORE DELETE ON entries
  FOR EACH ROW EXECUTE FUNCTION paillasse_forbid_delete();
