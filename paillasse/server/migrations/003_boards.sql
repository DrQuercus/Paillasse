-- Tableaux d'idées (post-it) par projet, partageables par lien + mot de passe.
-- Un tableau est un espace de réflexion : il ne fait pas partie du cahier scellé,
-- les post-it se modifient et se suppriment (suppression logique).

ALTER TABLE projects
  ADD COLUMN board_revision integer NOT NULL DEFAULT 0,          -- incrémenté à chaque changement (synchro)
  ADD COLUMN board_share_token text UNIQUE,                       -- NULL = tableau non partagé
  ADD COLUMN board_share_mode text NOT NULL DEFAULT 'edit' CHECK (board_share_mode IN ('edit', 'read')),
  ADD COLUMN board_share_password_hash text,
  ADD COLUMN board_share_version integer NOT NULL DEFAULT 0;      -- change = invités déconnectés

CREATE TABLE board_images (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES projects(id),
  sha256           text NOT NULL,
  filename         text NOT NULL,
  mime_type        text NOT NULL,
  size_bytes       bigint NOT NULL,
  uploaded_by      uuid REFERENCES users(id),                     -- NULL pour un invité
  uploaded_by_name text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE board_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id),
  x               real NOT NULL,
  y               real NOT NULL,
  width           real NOT NULL DEFAULT 220,
  color           text NOT NULL DEFAULT 'yellow',
  text            text NOT NULL DEFAULT '',
  image_id        uuid REFERENCES board_images(id),
  rotation        real NOT NULL DEFAULT 0,
  z               integer NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES users(id),                      -- NULL pour un invité
  author_name     text NOT NULL,
  updated_by_name text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX board_notes_project_idx ON board_notes (project_id) WHERE deleted_at IS NULL;

CREATE TABLE board_links (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  from_note  uuid NOT NULL REFERENCES board_notes(id),
  to_note    uuid NOT NULL REFERENCES board_notes(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (from_note <> to_note)
);
CREATE INDEX board_links_project_idx ON board_links (project_id) WHERE deleted_at IS NULL;
