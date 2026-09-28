-- Tiroirs : dans un congélateur −80, étagère › rack › tiroir › boîte (un rack à tiroirs, chaque tiroir tient
-- quelques boîtes). Un tiroir peut aussi se poser sur une étagère ou directement dans un appareil.
ALTER TABLE storage_units DROP CONSTRAINT storage_units_kind_check;
ALTER TABLE storage_units ADD CONSTRAINT storage_units_kind_check
  CHECK (kind IN ('room', 'freezer', 'fridge', 'tank', 'cabinet', 'shelf', 'rack', 'drawer', 'box', 'bag', 'canister', 'puck', 'gridbox'));
