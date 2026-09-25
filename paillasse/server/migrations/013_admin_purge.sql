-- Suppression par un administrateur (page Maintenance).
-- Les garde-fous restent actifs partout : une table en ajout seul refuse toujours UPDATE et DELETE,
-- une entrée ne se supprime toujours pas… sauf dans une transaction du serveur qui a posé
--   SET LOCAL paillasse.purge = 'on'
-- après une copie de sécurité et une confirmation de l'administrateur, et qui le note dans admin_log.
-- Le journal d'administration, lui, ne se modifie ni ne s'efface jamais (seule la référence à un
-- compte supprimé peut y être remise à NULL : le nom reste écrit en toutes lettres).

CREATE OR REPLACE FUNCTION paillasse_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('paillasse.purge', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Table % en ajout seul : % interdit', TG_TABLE_NAME, TG_OP;
END $$;

CREATE OR REPLACE FUNCTION paillasse_forbid_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('paillasse.purge', true) = 'on' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Les % ne se suppriment pas (utiliser archived)', TG_TABLE_NAME;
END $$;

CREATE FUNCTION paillasse_admin_log_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND current_setting('paillasse.purge', true) = 'on' AND NEW.user_id IS NULL
     AND NEW.id = OLD.id AND NEW.at = OLD.at AND NEW.user_name = OLD.user_name
     AND NEW.action = OLD.action AND NEW.detail = OLD.detail THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Journal d''administration : % interdit', TG_OP;
END $$;

DROP TRIGGER admin_log_append_only ON admin_log;
CREATE TRIGGER admin_log_guard BEFORE UPDATE OR DELETE ON admin_log
  FOR EACH ROW EXECUTE FUNCTION paillasse_admin_log_guard();

-- Compte supprimé dont le nom signe encore des versions figées : identifiant libéré, plus de mot de passe
ALTER TABLE users ADD COLUMN deleted_at timestamptz;
