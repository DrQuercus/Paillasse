-- Historique de construction : comment une séquence a été obtenue (PCR, puis clonage).
-- Exemple : { "method": "pcr", "template": { "sequence_id": …, "code": "SEQ-0002", "version": 3 },
--             "primers": [{ "name": "LR19…", "bases": "…" }], "region": { … } }
ALTER TABLE sequences ADD COLUMN origin jsonb;
