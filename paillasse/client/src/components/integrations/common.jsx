import { CopyButton } from '../admin/common.jsx';

export const TOKEN_PLACEHOLDER = 'pai_VOTRE_JETON';

export const SCOPE_LABELS = { read: 'Lecture seule', write: 'Lecture et écriture' };

/** Bloc de code à copier (configuration d'un outil, exemple de script). */
export function Snippet({ title, text }) {
  return (
    <figure className="int-snippet">
      <figcaption>
        <span>{title}</span>
        <CopyButton text={text} />
      </figcaption>
      <pre>{text}</pre>
    </figure>
  );
}

/** Adresse à donner à un outil : libellé, valeur, copie. */
export function Address({ label, value, hint, href }) {
  return (
    <div className="int-address">
      <span className="int-address-label">{label}</span>
      <code>{href ? <a href={href} target="_blank" rel="noreferrer">{value}</a> : value}</code>
      <CopyButton text={value} />
      {hint && <small>{hint}</small>}
    </div>
  );
}

/** Valeur secrète montrée une seule fois (jeton, secret de webhook). */
export function SecretOnce({ value, children }) {
  return (
    <>
      <div className="adm-password">
        <code className="adm-key">{value}</code>
        <CopyButton text={value} />
      </div>
      <p className="hint">{children}</p>
    </>
  );
}
