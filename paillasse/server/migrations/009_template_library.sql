-- Modèles de base (protocole, western blot, purification…) installés par Paillasse.
-- slug : identifiant stable d'un modèle de base (NULL pour un modèle du labo) ;
-- seed_hash : empreinte du contenu installé. Tant que le modèle n'a pas été modifié, son empreinte
-- actuelle est égale à seed_hash et une nouvelle version de Paillasse peut le mettre à jour ;
-- dès qu'il est modifié, il n'est plus jamais écrasé. Un modèle retiré (archivé) n'est pas réinstallé.

ALTER TABLE templates ALTER COLUMN created_by DROP NOT NULL;   -- NULL : modèle de base
ALTER TABLE templates ADD COLUMN category   text NOT NULL DEFAULT '';
ALTER TABLE templates ADD COLUMN slug       text;
ALTER TABLE templates ADD COLUMN seed_hash  text;
ALTER TABLE templates ADD COLUMN updated_by uuid REFERENCES users(id);
CREATE UNIQUE INDEX templates_slug_idx ON templates (slug) WHERE slug IS NOT NULL;
