-- Marqueurs de taille pour l'analyse des gels (protéines en kDa, ADN en pb).
-- bands : [{ "size": 250 }, …] du plus grand au plus petit ; "mass" facultative (ng pour l'ADN,
-- µg pour les protéines) pour un dépôt de « load » : elle permet de quantifier l'ADN par les bandes
-- du marqueur. Les masses dépendent du lot : elles ne sont pas pré-remplies, voir la fiche fabricant.
-- Attention : la migration apparente des marqueurs précolorés dépend du système de tampon
-- (Tris-glycine, Bis-Tris MES ou MOPS) ; les fabricants donnent une table par système.
-- Une figure insérée dans le cahier garde sa propre copie du marqueur utilisé.

CREATE TABLE ladders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('protein', 'dna')),
  bands       jsonb NOT NULL,
  load        double precision CHECK (load IS NULL OR load > 0),
  supplier    text NOT NULL DEFAULT '',
  reference   text NOT NULL DEFAULT '',
  notes       text NOT NULL DEFAULT '',
  archived    boolean NOT NULL DEFAULT false,
  created_by  uuid REFERENCES users(id),                       -- NULL : liste initiale
  updated_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ladders_name_idx ON ladders (lower(name)) WHERE NOT archived;

CREATE TRIGGER ladders_no_delete BEFORE DELETE ON ladders
  FOR EACH ROW EXECUTE FUNCTION paillasse_forbid_delete();

CREATE FUNCTION pg_temp.sizes(variadic s numeric[]) RETURNS jsonb LANGUAGE sql AS
  $$ SELECT jsonb_agg(jsonb_build_object('size', v) ORDER BY v DESC) FROM unnest(s) AS v $$;

INSERT INTO ladders (name, kind, supplier, reference, bands, notes) VALUES
  ('NEB Color Prestained Protein Standard, Broad Range', 'protein', 'New England Biolabs', 'P7719',
    pg_temp.sizes(250, 180, 130, 95, 72, 55, 43, 34, 26, 17, 10), 'Précoloré.'),
  ('PageRuler Plus Prestained', 'protein', 'Thermo Scientific', '26619',
    pg_temp.sizes(250, 130, 100, 70, 55, 35, 25, 15, 10), 'Précoloré.'),
  ('PageRuler Prestained', 'protein', 'Thermo Scientific', '26616',
    pg_temp.sizes(180, 130, 100, 70, 55, 40, 35, 25, 15, 10), 'Précoloré.'),
  ('PageRuler Prestained (ancienne référence, 10–170 kDa)', 'protein', 'Thermo Scientific', 'SM0671',
    pg_temp.sizes(170, 130, 100, 70, 55, 40, 35, 25, 15, 10), 'Précoloré.'),
  ('PageRuler Unstained', 'protein', 'Thermo Scientific', '26614',
    pg_temp.sizes(200, 150, 120, 100, 85, 70, 60, 50, 40, 30, 25, 20, 15, 10), 'Non coloré.'),
  ('Spectra Multicolor Broad Range', 'protein', 'Thermo Scientific', '26634',
    pg_temp.sizes(260, 140, 100, 70, 50, 40, 35, 25, 15, 10), 'Précoloré.'),
  ('Precision Plus Protein Dual Color', 'protein', 'Bio-Rad', '1610374',
    pg_temp.sizes(250, 150, 100, 75, 50, 37, 25, 20, 15, 10), 'Précoloré.'),
  ('Precision Plus Protein Unstained', 'protein', 'Bio-Rad', '1610363',
    pg_temp.sizes(250, 150, 100, 75, 50, 37, 25, 20, 15, 10), 'Non coloré.'),
  ('BenchMark Protein Ladder', 'protein', 'Invitrogen', '10747012',
    pg_temp.sizes(220, 160, 120, 100, 90, 80, 70, 60, 50, 40, 30, 25, 20, 15, 10), 'Non coloré.'),
  ('NEB 1 kb DNA Ladder', 'dna', 'New England Biolabs', 'N3232',
    pg_temp.sizes(10000, 8000, 6000, 5000, 4000, 3000, 2000, 1500, 1000, 500), ''),
  ('NEB 1 kb Plus DNA Ladder', 'dna', 'New England Biolabs', 'N3200',
    pg_temp.sizes(10000, 8000, 6000, 5000, 4000, 3000, 2000, 1500, 1200, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100), ''),
  ('NEB 100 bp DNA Ladder', 'dna', 'New England Biolabs', 'N3231',
    pg_temp.sizes(1517, 1200, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100), 'La bande de 500 pb est un doublet 500/517 pb.'),
  ('GeneRuler 1 kb DNA Ladder', 'dna', 'Thermo Scientific', 'SM0311',
    pg_temp.sizes(10000, 8000, 6000, 5000, 4000, 3500, 3000, 2500, 2000, 1500, 1000, 750, 500, 250), ''),
  ('GeneRuler 1 kb Plus DNA Ladder', 'dna', 'Thermo Scientific', 'SM1331',
    pg_temp.sizes(20000, 10000, 7000, 5000, 4000, 3000, 2000, 1500, 1000, 700, 500, 400, 300, 200, 75), ''),
  ('GeneRuler 100 bp Plus DNA Ladder', 'dna', 'Thermo Scientific', 'SM0321',
    pg_temp.sizes(3000, 2000, 1500, 1200, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100), ''),
  ('GeneRuler 100 bp DNA Ladder', 'dna', 'Thermo Scientific', 'SM0241',
    pg_temp.sizes(1000, 900, 800, 700, 600, 500, 400, 300, 200, 100), ''),
  ('Lambda DNA / HindIII', 'dna', 'New England Biolabs', 'N3012',
    pg_temp.sizes(23130, 9416, 6557, 4361, 2322, 2027, 564, 125), 'La bande de 125 pb est souvent trop faible pour être vue.');
