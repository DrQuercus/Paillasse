-- Projets privés ou partagés. Un projet appartient à son créateur (projects.created_by) ; il le partage
-- en invitant des comptes, et chacun doit accepter l'invitation avant de voir quoi que ce soit.
--   pending   invitation envoyée, pas encore d'accès
--   accepted  membre : lit et écrit dans le projet
--   declined  invitation refusée (le propriétaire peut réinviter)
-- Ce qui est rangé dans un projet (entrées, versions, pièces jointes, tableau d'idées, séquences et jeux de
-- données rattachés) suit ses droits. Un administrateur voit tout depuis la page Maintenance, en lecture.

CREATE TABLE project_members (
  project_id   uuid NOT NULL REFERENCES projects(id),
  user_id      uuid NOT NULL REFERENCES users(id),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  invited_by   uuid REFERENCES users(id),
  invited_at   timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX project_members_user_idx ON project_members (user_id, status);

-- Projets existants : privés à leur créateur ; qui y a déjà écrit en reste membre (rien ne disparaît
-- de la vue de quelqu'un qui y a travaillé).
INSERT INTO project_members (project_id, user_id, status, invited_by, responded_at)
SELECT DISTINCT e.project_id, e.created_by, 'accepted', p.created_by, now()
FROM entries e JOIN projects p ON p.id = e.project_id
WHERE e.created_by <> p.created_by
ON CONFLICT DO NOTHING;

-- Projets d'un compte déjà supprimé : confiés au plus ancien membre encore actif (il y a écrit) ; il pourra
-- les partager. Sans membre, ils restent tels quels : l'administrateur les voit dans Maintenance.
UPDATE projects p SET created_by = h.user_id, updated_at = now()
FROM (SELECT DISTINCT ON (m.project_id) m.project_id, m.user_id
      FROM project_members m JOIN users u ON u.id = m.user_id
      WHERE m.status = 'accepted' AND u.deleted_at IS NULL
      ORDER BY m.project_id, m.responded_at, m.invited_at) h
WHERE h.project_id = p.id AND p.created_by IN (SELECT id FROM users WHERE deleted_at IS NOT NULL);
DELETE FROM project_members m USING projects p WHERE p.id = m.project_id AND p.created_by = m.user_id;
