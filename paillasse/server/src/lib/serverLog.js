// Journal du serveur gardé en mémoire (les 400 dernières lignes), visible dans la page Maintenance.
// Les messages continuent d'aller vers la sortie standard (journalctl -u paillasse).
import { format } from 'node:util';

const MAX = 400;
const lines = [];
let installed = false;

export function installServerLog() {
  if (installed) return;
  installed = true;
  for (const level of ['log', 'info', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      lines.push({ at: new Date().toISOString(), level: level === 'log' ? 'info' : level, text: format(...args).slice(0, 4000) });
      if (lines.length > MAX) lines.splice(0, lines.length - MAX);
      original(...args);
    };
  }
}

export const serverLog = () => [...lines].reverse();
