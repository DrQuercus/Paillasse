-- Registre de séquences (plasmides, fragments, oligos) et leurs versions figées.
CREATE SEQUENCE sequence_code_seq;

CREATE TABLE sequences (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code              text NOT NULL UNIQUE DEFAULT ('SEQ-' || lpad(nextval('sequence_code_seq')::text, 4, '0')),
  name              text NOT NULL,
  description       text NOT NULL DEFAULT '',
  project_id        uuid REFERENCES projects(id),
  -- copie de travail, au format paillasse-seq/1 (voir src/lib/seq/model.js)
  sequence          text NOT NULL,
  circular          boolean NOT NULL,
  features          jsonb NOT NULL DEFAULT '[]',
  primers           jsonb NOT NULL DEFAULT '[]',
  length            integer NOT NULL,
  revision          integer NOT NULL DEFAULT 0,
  version_count     integer NOT NULL DEFAULT 0,
  last_version_hash text,
  archived          boolean NOT NULL DEFAULT false,
  created_by        uuid NOT NULL REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sequences_updated_idx ON sequences (updated_at DESC);

CREATE TABLE sequence_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id    uuid NOT NULL REFERENCES sequences(id),
  version_number integer NOT NULL,
  note           text NOT NULL DEFAULT '',
  name           text NOT NULL,
  description    text NOT NULL,
  sequence       text NOT NULL,
  circular       boolean NOT NULL,
  features       jsonb NOT NULL,
  primers        jsonb NOT NULL,
  created_by     uuid NOT NULL REFERENCES users(id),
  created_at     timestamptz NOT NULL,
  content_hash   text NOT NULL,
  prev_hash      text,
  hash           text NOT NULL,
  UNIQUE (sequence_id, version_number)
);

-- Fichier d'origine d'un import (.dna, .gb…), conservé tel quel
CREATE TABLE sequence_files (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES sequences(id),
  sha256      text NOT NULL,
  filename    text NOT NULL,
  mime_type   text NOT NULL,
  size_bytes  bigint NOT NULL,
  created_by  uuid NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER sequence_versions_append_only BEFORE UPDATE OR DELETE ON sequence_versions
  FOR EACH ROW EXECUTE FUNCTION paillasse_append_only();
CREATE TRIGGER sequence_files_append_only BEFORE UPDATE OR DELETE ON sequence_files
  FOR EACH ROW EXECUTE FUNCTION paillasse_append_only();
CREATE TRIGGER sequences_no_delete BEFORE DELETE ON sequences
  FOR EACH ROW EXECUTE FUNCTION paillasse_forbid_delete();
