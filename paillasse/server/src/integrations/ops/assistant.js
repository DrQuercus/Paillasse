// Liaison d'un compte avec l'assistant IA du labo : la personne donne à l'assistant le code montré dans Paillasse.
import { HttpError } from '../../lib/errors.js';
import { assistantName, linkWithCode } from '../assistant.js';
import { define } from '../registry.js';
import { params, str } from '../schema.js';

define({
  name: 'link_account',
  title: 'Relier son compte Paillasse',
  group: 'Assistant',
  scope: 'read',
  profiles: ['assistant'],
  allowUnlinked: true,
  http: { method: 'POST', path: '/link' },
  description: 'Relie le compte de la personne chez l’assistant à son compte Paillasse, avec le code de liaison qu’elle lit dans '
    + 'Paillasse (Intégrations › Assistant). À employer seulement quand elle donne ce code ; ensuite, Paillasse lui répond avec ses droits.',
  input: params({ code: str('Code de liaison donné par la personne, ex. 7KQ2-M9XD (8 caractères).', { minLength: 4, maxLength: 20 }) }, ['code']),
  async handler(a, ctx) {
    if (!ctx.assistant) throw new HttpError(400, `Ce code se donne à ${assistantName()}, pas à un jeton ni à une session Paillasse.`);
    const l = await linkWithCode(ctx.assistant, a.code);
    return {
      linked: true,
      account: l.display_name,
      scope: l.scope === 'write' ? 'lecture et écriture' : 'lecture seule',
      message: `Compte relié : Paillasse répond maintenant à ${l.display_name}, ${l.scope === 'write' ? 'en lecture et en écriture (chaque écriture passe par un aperçu à confirmer)' : 'en lecture seule (l’écriture s’ouvre dans Paillasse › Intégrations › Assistant)'}.`,
    };
  },
});
