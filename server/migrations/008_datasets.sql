-- Jeux de données de l'outil Statistiques : tableau (Colonnes, XY, Groupé, Contingence, Survie),
-- réglages de l'analyse et du graphique, en JSON (voir client/src/lib/stats/model.js).
--
-- Ils se modifient librement, comme des brouillons de travail ; ce qui fait foi est la copie
-- insérée dans une entrée (encart « graphique et statistiques »), scellée avec la version.
-- On archive, on ne supprime pas. « revision » évite d'écraser une modification faite ailleurs.

CREATE TABLE datasets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL DEFAULT '',
  kind        text NOT NULL CHECK (kind IN ('column', 'xy', 'grouped', 'contingency', 'survival')),
  data        jsonb NOT NULL,
  project_id  uuid REFERENCES projects(id),
  revision    integer NOT NULL DEFAULT 1,
  archived    boolean NOT NULL DEFAULT false,
  created_by  uuid REFERENCES users(id),
  updated_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX datasets_recent_idx ON datasets (updated_at DESC) WHERE NOT archived;

CREATE TRIGGER datasets_no_delete BEFORE DELETE ON datasets
  FOR EACH ROW EXECUTE FUNCTION paillasse_forbid_delete();
