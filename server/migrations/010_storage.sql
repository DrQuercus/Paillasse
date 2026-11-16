-- Stockage des échantillons : pièces, appareils (congélateurs −20 / −80 °C, réfrigérateurs, cuves d'azote,
-- armoires), étagères, racks (ou tours de cuve), boîtes à positions (9 × 9, 10 × 10…) et sacs sans positions.
-- Un échantillon (tube, cryotube, flacon) occupe une position d'une boîte, ou est simplement dans un sac.
-- Rien ne s'efface : un contenant se retire (archived) une fois vide, un tube épuisé ou jeté est archivé,
-- et chaque geste (rangé, déplacé, sorti, remis, décongelé, jeté) est écrit dans sample_events.

CREATE TABLE storage_units (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   uuid REFERENCES storage_units(id),
  kind        text NOT NULL CHECK (kind IN ('room', 'freezer', 'fridge', 'tank', 'cabinet', 'shelf', 'rack', 'box', 'bag')),
  name        text NOT NULL,
  temperature double precision,                 -- °C, pour les appareils
  style       text NOT NULL DEFAULT '',         -- congélateur : 'upright' (armoire) ou 'chest' (coffre)
  rows        integer CHECK (rows IS NULL OR rows BETWEEN 1 AND 26),
  cols        integer CHECK (cols IS NULL OR cols BETWEEN 1 AND 30),
  color       text NOT NULL DEFAULT '',
  notes       text NOT NULL DEFAULT '',
  sort        integer NOT NULL DEFAULT 0,       -- ordre parmi les voisins (étagère 1, 2, 3…)
  archived    boolean NOT NULL DEFAULT false,
  created_by  uuid REFERENCES users(id),
  updated_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'box' OR (rows IS NOT NULL AND cols IS NOT NULL)),
  CHECK (parent_id IS DISTINCT FROM id)
);
CREATE INDEX storage_units_parent_idx ON storage_units (parent_id) WHERE NOT archived;

CREATE TRIGGER storage_units_no_delete BEFORE DELETE ON storage_units
  FOR EACH ROW EXECUTE FUNCTION paillasse_forbid_delete();

CREATE SEQUENCE sample_code_seq;

CREATE TABLE samples (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE DEFAULT ('ECH-' || lpad(nextval('sample_code_seq')::text, 4, '0')),
  name          text NOT NULL,
  type          text NOT NULL DEFAULT 'other',
  unit_id       uuid REFERENCES storage_units(id),
  row           integer,                        -- position dans la boîte (0 = ligne A)
  col           integer,                        -- (0 = colonne 1)
  cap_color     text NOT NULL DEFAULT '',
  concentration text NOT NULL DEFAULT '',
  volume        text NOT NULL DEFAULT '',
  aliquot       text NOT NULL DEFAULT '',       -- « 3/10 »
  frozen_on     date,
  expires_on    date,
  thaw_count    integer NOT NULL DEFAULT 0 CHECK (thaw_count >= 0),
  status        text NOT NULL DEFAULT 'stored' CHECK (status IN ('stored', 'out', 'used')),
  owner_id      uuid REFERENCES users(id),
  project_id    uuid REFERENCES projects(id),
  sequence_id   uuid REFERENCES sequences(id),
  entry_id      uuid REFERENCES entries(id),
  notes         text NOT NULL DEFAULT '',
  archived      boolean NOT NULL DEFAULT false, -- épuisé ou jeté
  out_since     timestamptz,                    -- sorti du froid depuis…
  created_by    uuid REFERENCES users(id),
  updated_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((row IS NULL) = (col IS NULL)),
  CHECK (row IS NULL OR (row >= 0 AND col >= 0))
);
-- Une position ne loge qu'un tube (un tube sorti garde sa place)
CREATE UNIQUE INDEX samples_position_idx ON samples (unit_id, row, col) WHERE NOT archived AND row IS NOT NULL;
CREATE INDEX samples_unit_idx ON samples (unit_id) WHERE NOT archived;
CREATE INDEX samples_sequence_idx ON samples (sequence_id) WHERE sequence_id IS NOT NULL;
CREATE INDEX samples_entry_idx ON samples (entry_id) WHERE entry_id IS NOT NULL;

CREATE TRIGGER samples_no_delete BEFORE DELETE ON samples
  FOR EACH ROW EXECUTE FUNCTION paillasse_forbid_delete();

-- Historique de chaque tube, en ajout seul
CREATE TABLE sample_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id   uuid NOT NULL REFERENCES samples(id),
  kind        text NOT NULL,                    -- created, edited, moved, out, back, thawed, discarded, restored
  detail      text NOT NULL DEFAULT '',
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sample_events_sample_idx ON sample_events (sample_id, created_at);
CREATE INDEX sample_events_recent_idx ON sample_events (created_at DESC);

CREATE TRIGGER sample_events_append_only BEFORE UPDATE OR DELETE ON sample_events
  FOR EACH ROW EXECUTE FUNCTION paillasse_append_only();
