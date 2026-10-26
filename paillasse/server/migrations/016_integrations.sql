-- Intégrations : ouvrir le cahier aux autres outils (IA locale, automatisations, tableurs, scripts).
--
-- api_tokens          jetons d'accès personnels (Authorization: Bearer pai_…). On ne garde que leur empreinte
--                     SHA-256 : le jeton n'est montré qu'une fois, à sa création. Portée 'read' (lecture seule)
--                     ou 'write' (lecture et écriture) ; un jeton n'a jamais les droits d'administration.
-- integration_events  ce qui change dans le cahier (entrée créée, verrouillée, tube déplacé…), en ajout seul,
--                     gardé 90 jours : flux de changements (/api/v1/changes) et source des webhooks.
--                     audience : comptes qui voyaient l'objet au moment de l'événement (suppression, entrée
--                     sortie d'un projet) ; NULL = selon le projet, ou tout le labo sans projet.
-- webhooks            appels sortants signés vers un outil (n8n, Node-RED, script…) à chaque événement choisi.
-- webhook_deliveries  chaque envoi, ses tentatives et leur résultat (relances espacées en cas d'échec).

CREATE TABLE api_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  name          text NOT NULL,
  scope         text NOT NULL CHECK (scope IN ('read', 'write')),
  token_hash    text NOT NULL UNIQUE,
  token_hint    text NOT NULL,                 -- début et fin du jeton, pour le reconnaître : pai_Ab12…xY9z
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz,
  last_used_at  timestamptz,
  last_used_ip  text NOT NULL DEFAULT '',
  use_count     bigint NOT NULL DEFAULT 0,
  revoked_at    timestamptz,
  revoked_by    uuid REFERENCES users(id)
);
CREATE INDEX api_tokens_user_idx ON api_tokens (user_id, created_at DESC);

CREATE TABLE integration_events (
  id           bigserial PRIMARY KEY,
  type         text NOT NULL,                  -- entry.locked, sample.moved…
  object_type  text NOT NULL,                  -- entry, sequence, sample…
  object_id    text NOT NULL,
  project_id   uuid,                           -- pas de clé étrangère : un projet supprimé garde ses événements
  audience     uuid[],
  actor_id     uuid,
  actor_name   text NOT NULL DEFAULT '',
  data         jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX integration_events_object_idx ON integration_events (object_type, object_id, id DESC);
CREATE INDEX integration_events_created_idx ON integration_events (created_at);

CREATE TABLE webhooks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id),
  name             text NOT NULL DEFAULT '',
  url              text NOT NULL,
  secret           text NOT NULL,              -- whsec_… : signature HMAC-SHA256 (Standard Webhooks)
  events           text[] NOT NULL DEFAULT '{}', -- vide : tous ; « entry.* » : toute une famille
  project_id       uuid,                       -- NULL : tous les projets visibles (et ce qui est au labo)
  header_name      text NOT NULL DEFAULT '',   -- en-tête ajouté à chaque envoi (ex. Authorization), facultatif
  header_value     text NOT NULL DEFAULT '',
  origin           text NOT NULL DEFAULT '',   -- adresse publique du cahier (liens dans les envois)
  active           boolean NOT NULL DEFAULT true,
  disabled_reason  text NOT NULL DEFAULT '',
  last_event_id    bigint NOT NULL DEFAULT 0,  -- dernier événement examiné
  failure_streak   integer NOT NULL DEFAULT 0, -- envois abandonnés d'affilée (désactivation au-delà de 20)
  last_status      text NOT NULL DEFAULT '',
  last_delivery_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhooks_user_idx ON webhooks (user_id);

CREATE TABLE webhook_deliveries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id       uuid NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_id         bigint,                     -- NULL : envoi de test
  event_type       text NOT NULL,
  payload          jsonb NOT NULL,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ok', 'failed')),
  attempts         integer NOT NULL DEFAULT 0,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  response_status  integer,
  error            text NOT NULL DEFAULT '',
  duration_ms      integer,
  created_at       timestamptz NOT NULL DEFAULT now(),
  delivered_at     timestamptz
);
CREATE INDEX webhook_deliveries_due_idx ON webhook_deliveries (next_attempt_at) WHERE status = 'pending';
CREATE INDEX webhook_deliveries_hook_idx ON webhook_deliveries (webhook_id, created_at DESC);

-- Suppressions (toujours faites par un administrateur, page Maintenance) : notées comme événements, pour qu'un
-- outil synchronisé (index d'une IA, tableur) retire ce qui a disparu. L'audience est relevée avant que les
-- membres du projet ne disparaissent : qui voyait l'objet apprend qu'il n'existe plus.
-- Les numéros d'événement suivent l'ordre de validation des transactions (verrou 727275 tenu jusqu'au COMMIT,
-- voir server/src/integrations/events.js) : pendant la transaction, une suppression attend dans
-- integration_events_pending ; elle est écrite à la validation, sous le verrou.
CREATE TABLE integration_events_pending (
  seq          bigserial PRIMARY KEY,
  type         text NOT NULL,
  object_type  text NOT NULL,
  object_id    text NOT NULL,
  project_id   uuid,
  audience     uuid[],
  actor_name   text NOT NULL DEFAULT '',
  data         jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION paillasse_flush_events() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Déclenché pour chaque ligne en attente ; le premier appel écrit tout
  IF current_setting('paillasse.events_flushed', true) = 'on' THEN RETURN NULL; END IF;
  PERFORM set_config('paillasse.events_flushed', 'on', true);
  PERFORM pg_advisory_xact_lock(727275);
  WITH moved AS (DELETE FROM integration_events_pending RETURNING *)
  INSERT INTO integration_events (type, object_type, object_id, project_id, audience, actor_name, data, created_at)
  SELECT type, object_type, object_id, project_id, audience, actor_name, data, created_at FROM moved ORDER BY seq;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER integration_events_pending_flush AFTER INSERT ON integration_events_pending
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION paillasse_flush_events();

CREATE FUNCTION paillasse_note_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  kind text := TG_ARGV[0];
  pid uuid := NULL;
  who uuid[] := NULL;
BEGIN
  IF kind = 'project' THEN
    pid := OLD.id;
  -- Le stockage est commun au labo, même pour un tube rattaché à un projet
  ELSIF kind <> 'sample' AND to_jsonb(OLD) ? 'project_id' THEN
    pid := (to_jsonb(OLD)->>'project_id')::uuid;
  END IF;
  IF pid IS NOT NULL THEN
    SELECT array_agg(DISTINCT u) INTO who FROM (
      SELECT created_by AS u FROM projects WHERE id = pid
      UNION SELECT user_id FROM project_members WHERE project_id = pid AND status = 'accepted'
      UNION SELECT (to_jsonb(OLD)->>'created_by')::uuid WHERE kind = 'project'
      -- Projet supprimé : ses membres sont retirés juste avant lui ; la purge les a notés (server/src/lib/purge.js)
      UNION SELECT x::uuid FROM jsonb_array_elements_text(coalesce(
        nullif(current_setting('paillasse.project_audience', true), '')::jsonb -> pid::text, '[]'::jsonb)) x
    ) s WHERE u IS NOT NULL;
    who := coalesce(who, '{}');
  END IF;
  INSERT INTO integration_events_pending (type, object_type, object_id, project_id, audience, actor_name, data)
  VALUES (kind || '.deleted', kind, OLD.id::text, pid, who, 'Administrateur',
          jsonb_build_object('title', coalesce(to_jsonb(OLD)->>'title', to_jsonb(OLD)->>'name', ''),
                             'code', to_jsonb(OLD)->>'code'));
  RETURN OLD;
END $$;

CREATE TRIGGER entries_note_deletion AFTER DELETE ON entries FOR EACH ROW EXECUTE FUNCTION paillasse_note_deletion('entry');
CREATE TRIGGER projects_note_deletion AFTER DELETE ON projects FOR EACH ROW EXECUTE FUNCTION paillasse_note_deletion('project');
CREATE TRIGGER sequences_note_deletion AFTER DELETE ON sequences FOR EACH ROW EXECUTE FUNCTION paillasse_note_deletion('sequence');
CREATE TRIGGER samples_note_deletion AFTER DELETE ON samples FOR EACH ROW EXECUTE FUNCTION paillasse_note_deletion('sample');
CREATE TRIGGER storage_units_note_deletion AFTER DELETE ON storage_units FOR EACH ROW EXECUTE FUNCTION paillasse_note_deletion('storage_unit');
CREATE TRIGGER datasets_note_deletion AFTER DELETE ON datasets FOR EACH ROW EXECUTE FUNCTION paillasse_note_deletion('dataset');
CREATE TRIGGER templates_note_deletion AFTER DELETE ON templates FOR EACH ROW EXECUTE FUNCTION paillasse_note_deletion('template');
CREATE TRIGGER reagents_note_deletion AFTER DELETE ON reagents FOR EACH ROW EXECUTE FUNCTION paillasse_note_deletion('reagent');
CREATE TRIGGER ladders_note_deletion AFTER DELETE ON ladders FOR EACH ROW EXECUTE FUNCTION paillasse_note_deletion('ladder');
