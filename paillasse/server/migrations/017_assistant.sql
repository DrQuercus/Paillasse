-- Assistant IA du labo (Open WebUI ou compatible) : il appelle Paillasse au nom de la personne qui lui parle.
-- Chaque compte Paillasse peut être relié à son identité chez l'assistant (subject : identifiant de la
-- personne chez l'assistant, garanti par un en-tête signé ou par la vérification de sa session). La liaison se
-- fait avec un code à usage unique, montré dans Paillasse et donné à l'assistant, valable 10 minutes : la
-- personne prouve ainsi qu'elle tient les deux comptes. scope : ce que l'assistant peut faire en son nom
-- (lecture seule par défaut).

CREATE TABLE assistant_links (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL UNIQUE REFERENCES users(id),
  subject          text UNIQUE,                  -- NULL tant que le compte n'est pas relié
  email            text NOT NULL DEFAULT '',
  name             text NOT NULL DEFAULT '',
  scope            text NOT NULL DEFAULT 'read' CHECK (scope IN ('read', 'write')),
  code_hash        text,                         -- code de liaison en attente (SHA-256)
  code_expires_at  timestamptz,
  linked_at        timestamptz,
  last_used_at     timestamptz,
  use_count        bigint NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assistant_links_code_idx ON assistant_links (code_hash) WHERE code_hash IS NOT NULL;
