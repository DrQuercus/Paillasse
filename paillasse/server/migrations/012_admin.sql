-- Administration : comptes (rôle admin, désactivation, mot de passe provisoire, sessions révoquées),
-- journal d'administration en ajout seul, réglages (mode maintenance), sauvegardes planifiées.

ALTER TABLE users
  ADD COLUMN is_admin             boolean NOT NULL DEFAULT false,
  ADD COLUMN disabled_at          timestamptz,                -- compte désactivé : plus de connexion
  ADD COLUMN must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN sessions_valid_after timestamptz,                -- sessions ouvertes avant : refusées
  ADD COLUMN last_login_at        timestamptz;

-- Le premier compte du labo devient administrateur
UPDATE users SET is_admin = true WHERE id = (SELECT id FROM users ORDER BY created_at LIMIT 1);

-- Qui a fait quoi dans l'administration (comptes, sauvegardes, restaurations, base, fichiers)
CREATE TABLE admin_log (
  id         bigserial PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT now(),
  user_id    uuid REFERENCES users(id),                      -- NULL : le serveur lui-même (planification)
  user_name  text NOT NULL DEFAULT '',
  action     text NOT NULL,
  detail     text NOT NULL DEFAULT ''
);
CREATE INDEX admin_log_at_idx ON admin_log (at DESC);
CREATE TRIGGER admin_log_append_only BEFORE UPDATE OR DELETE ON admin_log
  FOR EACH ROW EXECUTE FUNCTION paillasse_append_only();

CREATE TABLE app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);

-- Destinations de sauvegarde : dossier du serveur (NAS monté, disque) ou serveur SSH (utilisateur@hôte:/chemin)
CREATE TABLE backup_targets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  dest       text NOT NULL,
  port       integer CHECK (port IS NULL OR port BETWEEN 1 AND 65535),
  enabled    boolean NOT NULL DEFAULT true,
  schedule   text NOT NULL DEFAULT '02:30' CHECK (schedule = '' OR schedule ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  keep       integer NOT NULL DEFAULT 30 CHECK (keep BETWEEN 1 AND 1000),
  archived   boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE backup_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id    uuid NOT NULL REFERENCES backup_targets(id),
  trigger      text NOT NULL CHECK (trigger IN ('manual', 'schedule')),
  status       text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'failed', 'interrupted')),
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  dump_name    text,
  dump_bytes   bigint,
  blobs_copied integer,
  log          text NOT NULL DEFAULT '',
  started_by   uuid REFERENCES users(id)
);
CREATE INDEX backup_runs_target_idx ON backup_runs (target_id, started_at DESC);
