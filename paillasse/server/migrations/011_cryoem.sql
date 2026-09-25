-- Cryo-EM : dewar › canister › puck › boîte à grilles › grille.
-- Un canister et un puck portent un numéro (name) et un nombre de cases (capacity) ; un puck occupe un
-- niveau de son canister et une boîte une case de son puck (slot). Une boîte à grilles a un format :
--   g4   4 grilles non clippées        g4c  4 grilles clippées
--   g4c4 4 clippées (C1–C4) + 4 non clippées (N1–N4)                  g12  12 grilles
-- Ses positions sont rangées sur une ligne (rows = 1, cols = nombre de grilles), comme une petite boîte.
-- Les conditions de préparation d'une grille (support, glow discharge, Vitrobot, criblage…) vont dans
-- samples.details.

ALTER TABLE storage_units DROP CONSTRAINT storage_units_kind_check;
ALTER TABLE storage_units ADD CONSTRAINT storage_units_kind_check
  CHECK (kind IN ('room', 'freezer', 'fridge', 'tank', 'cabinet', 'shelf', 'rack', 'box', 'bag', 'canister', 'puck', 'gridbox'));
ALTER TABLE storage_units ADD COLUMN format   text NOT NULL DEFAULT '';
ALTER TABLE storage_units ADD COLUMN slot     integer CHECK (slot IS NULL OR slot >= 1);
ALTER TABLE storage_units ADD COLUMN capacity integer CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 40);
ALTER TABLE storage_units ADD CONSTRAINT storage_units_gridbox_check
  CHECK (kind <> 'gridbox' OR (format IN ('g4', 'g4c', 'g4c4', 'g12') AND rows = 1 AND cols IS NOT NULL));
-- Une case (niveau d'un canister, case d'un puck) ne reçoit qu'un contenant
CREATE UNIQUE INDEX storage_units_slot_idx ON storage_units (parent_id, slot) WHERE NOT archived AND slot IS NOT NULL;

ALTER TABLE samples ADD COLUMN details jsonb NOT NULL DEFAULT '{}';
