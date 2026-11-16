export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

export const notFound = (what = 'Ressource') => new HttpError(404, `${what} introuvable`);
