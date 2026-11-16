// Tâches longues lancées depuis la page Maintenance (sauvegarde, restauration, vérifications) :
// suivies en mémoire, la page interroge leur avancement.
import crypto from 'node:crypto';

const jobs = new Map();
const MAX_JOBS = 40;

/**
 * Lance fn(job) en arrière-plan. job.log(texte), job.progress(fait, total) ; ce que fn renvoie devient job.result.
 * exclusive : une seule tâche de ce groupe à la fois (sauvegarde et restauration ne se chevauchent pas).
 */
export function startJob(kind, label, fn, { exclusive = null, user = null } = {}) {
  if (exclusive) {
    const busy = [...jobs.values()].find((j) => j.exclusive === exclusive && j.status === 'running');
    if (busy) {
      const err = new Error(`Déjà en cours : ${busy.label}. Attendez qu’elle se termine.`);
      err.status = 409;
      err.expose = true;
      throw err;
    }
  }
  const job = {
    id: crypto.randomUUID(), kind, label, exclusive, status: 'running', startedAt: new Date().toISOString(), finishedAt: null,
    done: 0, total: 0, lines: [], result: null, error: null, by: user?.display_name ?? 'Serveur',
  };
  job.log = (text) => {
    job.lines.push({ at: new Date().toISOString(), text: String(text) });
    if (job.lines.length > 500) job.lines.splice(0, job.lines.length - 500);
  };
  job.progress = (done, total = job.total) => { job.done = done; job.total = total; };
  jobs.set(job.id, job);
  if (jobs.size > MAX_JOBS) jobs.delete(jobs.keys().next().value);
  Promise.resolve()
    .then(() => fn(job))
    .then((result) => { job.result = result ?? null; job.status = 'ok'; })
    .catch((err) => { job.error = err.message; job.status = 'failed'; job.log(`Échec : ${err.message}`); })
    .finally(() => { job.finishedAt = new Date().toISOString(); });
  return job;
}

const view = ({ log, progress, exclusive, ...j }) => j;
export const getJob = (id) => (jobs.has(id) ? view(jobs.get(id)) : null);
export const listJobs = () => [...jobs.values()].reverse().map((j) => ({ ...view(j), lines: j.lines.slice(-3) }));
export const runningJob = (group) => [...jobs.values()].find((j) => j.exclusive === group && j.status === 'running') ?? null;
