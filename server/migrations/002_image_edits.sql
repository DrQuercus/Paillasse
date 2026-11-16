-- Retouches d'images : une image retouchée est une nouvelle pièce jointe
-- qui pointe vers l'original (conservé) et garde la liste exacte des retouches.
ALTER TABLE attachments
  ADD COLUMN derived_from uuid REFERENCES attachments(id),
  ADD COLUMN edit_params jsonb;

CREATE INDEX attachments_derived_idx ON attachments (derived_from);
