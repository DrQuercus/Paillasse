import { useCallback, useEffect, useState } from 'react';
import { Bot, ExternalLink, Link2, Unlink } from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import { Card, CopyButton, Status, ago, formatDate } from '../admin/common.jsx';

const SCOPES = [
  ['read', 'Lecture seule', 'Il cherche et lit pour vous (entrées, tubes, séquences, protocoles) ; il ne peut rien modifier.'],
  ['write', 'Lecture et écriture', 'Il peut aussi noter une manip, compléter un brouillon, ranger, déplacer ou sortir des tubes : chaque écriture vous est d’abord montrée en aperçu, et ne se fait qu’avec votre accord.'],
];

/**
 * Assistant IA du labo (Open WebUI ou compatible) : relier son compte une fois, par un code à lui donner,
 * puis choisir ce qu'il peut faire en votre nom.
 */
export default function AssistantCard({ assistant }) {
  const { notify, user } = useApp();
  const [state, setState] = useState(null);
  const [code, setCode] = useState(null);
  const load = useCallback(() => api.get('/integrations/assistant').then(setState).catch((err) => notify(err.message, 'error')), [notify]);
  useEffect(() => { if (assistant.configured) load(); }, [assistant.configured, load]);

  // Code en attente : on regarde toutes les 3 secondes si l'assistant l'a reçu
  useEffect(() => {
    if (!code || state?.link?.linked) return undefined;
    const t = setInterval(async () => {
      try {
        const next = await api.get('/integrations/assistant');
        setState(next);
        if (next.link?.linked) {
          setCode(null);
          notify(`Compte relié à ${assistant.name}.`, 'success');
        } else if (new Date(code.expires_at) < new Date()) {
          setCode(null);
        }
      } catch { /* nouvel essai au prochain passage */ }
    }, 3000);
    return () => clearInterval(t);
  }, [code, state?.link?.linked, assistant.name, notify]);

  if (!assistant.configured) {
    if (!user.is_admin) return null;
    return (
      <Card title="Assistant IA du labo" icon={Bot}>
        <p className="small muted">Pas encore branché. Une IA du labo (Open WebUI ou compatible) peut appeler Paillasse au nom de la personne
          qui lui parle, avec ses droits : réglages du serveur, puis Maintenance › Intégrations.</p>
      </Card>
    );
  }

  const newCode = async () => {
    try {
      setCode(await api.post('/integrations/assistant/code'));
    } catch (err) {
      notify(err.message, 'error');
    }
  };
  const setScope = async (scope) => {
    try {
      await api.patch('/integrations/assistant', { scope });
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  };
  const unlinkMe = async () => {
    if (!window.confirm(`Délier votre compte de ${assistant.name} ? Il ne pourra plus rien lire ni écrire dans Paillasse en votre nom.`)) return;
    try {
      await api.del('/integrations/assistant');
      notify('Compte délié.', 'success');
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const link = state?.link;
  const sentence = code ? `Relie mon compte Paillasse avec le code ${code.code}` : '';
  return (
    <Card
      title={`Assistant : ${assistant.name}`}
      icon={Bot}
      className="int-assistant"
      actions={assistant.url && <a className="btn btn-small" href={assistant.url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Ouvrir {assistant.name}</a>}
    >
      {!assistant.active && <p className="adm-banner is-warn">L’accès par l’assistant est coupé par l’administrateur du cahier.</p>}
      {state && !link?.linked && (
        <>
          <p className="small">
            {assistant.name} peut répondre avec <strong>vos</strong> droits sur Paillasse : chercher dans le cahier, résumer une entrée, retrouver un
            tube, préparer une manip. Reliez une fois votre compte chez {assistant.name} à votre compte Paillasse.
          </p>
          {!code ? (
            <p><button type="button" className="btn btn-primary" onClick={newCode} disabled={!assistant.active}><Link2 size={15} /> Obtenir un code de liaison</button></p>
          ) : (
            <div className="int-link-code">
              <div className="adm-password">
                <code>{code.code}</code>
                <CopyButton text={code.code} />
              </div>
              <p>Dites à {assistant.name} : <q>{sentence}</q> <CopyButton text={sentence} label="Copier la phrase" /></p>
              <p className="hint"><Status level="running">En attente</Status> Valable jusqu’à {new Date(code.expires_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}, une seule fois. Cette page se met à jour dès que c’est fait.</p>
            </div>
          )}
        </>
      )}
      {link?.linked && (
        <>
          <p className="small">
            <Status level="ok">Relié</Status> à <strong>{link.email || link.name}</strong>{link.email && link.name ? ` (${link.name})` : ''} depuis le {formatDate(link.linked_at)}
            {link.last_used_at ? ` · dernière utilisation ${ago(link.last_used_at)}, ${link.use_count.toLocaleString('fr-FR')} appel${link.use_count > 1 ? 's' : ''}` : ' · pas encore utilisé'}.
          </p>
          <div className="adm-choice" role="radiogroup" aria-label={`Ce que ${assistant.name} peut faire en votre nom`}>
            {SCOPES.map(([value, label, help]) => (
              <label key={value} className={`adm-choice-item${link.scope === value ? ' is-on' : ''}`}>
                <input type="radio" name="assistant-scope" checked={link.scope === value} onChange={() => setScope(value)} />
                <span><strong>{label}</strong><small>{help}</small></span>
              </label>
            ))}
          </div>
          <p className="hint">Jamais de droits d’administration, ni de verrouillage d’entrée. Tout ce qu’il fait est signé de votre nom, comme si vous l’aviez fait.</p>
          <p><button type="button" className="btn btn-small btn-ghost btn-danger-ghost" onClick={unlinkMe}><Unlink size={14} /> Délier</button></p>
        </>
      )}
    </Card>
  );
}
