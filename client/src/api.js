export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || (status ? `Erreur ${status}` : 'Serveur injoignable'));
    this.status = status;
    this.body = body;
  }
}

async function request(method, url, body, headers = {}) {
  const init = { method, credentials: 'same-origin', headers: { ...headers } };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api${url}`, init);
  } catch {
    throw new ApiError(0, { error: 'Serveur injoignable. Vérifiez la connexion au réseau du labo.' });
  }
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    // (un tableau partagé gère lui-même son mot de passe)
    if (res.status === 401 && !url.startsWith('/auth/') && !url.startsWith('/shared/')) {
      window.dispatchEvent(new Event('paillasse:unauthorized'));
    }
    // Mode maintenance (seuls les administrateurs travaillent) ; mot de passe provisoire à changer
    if (res.status === 503 && data?.maintenance && url !== '/auth/login') {
      window.dispatchEvent(new CustomEvent('paillasse:maintenance', { detail: data.error }));
    }
    if (res.status === 403 && data?.mustChangePassword) window.dispatchEvent(new Event('paillasse:must-change-password'));
    throw new ApiError(res.status, data);
  }
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  patch: (url, body) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
  uploadFiles(url, files, fields = {}) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) if (v) form.append(k, v);
    for (const f of files) form.append('files', f);
    return request('POST', url, form);
  },
  upload(entryId, file, { derived_from: derivedFrom, edit_params: editParams } = {}) {
    const form = new FormData();
    if (derivedFrom) form.append('derived_from', derivedFrom);
    if (editParams) form.append('edit_params', JSON.stringify(editParams));
    form.append('file', file);
    return request('POST', `/entries/${entryId}/attachments`, form);
  },
};

export const fileUrl = (attachmentId) => `/api/files/${attachmentId}`;

/** Client limité à un préfixe d'URL (tableau du propriétaire ou tableau partagé). */
export function scopedApi(base, getHeaders = () => ({})) {
  return {
    base,
    get: (url) => request('GET', base + url, undefined, getHeaders()),
    post: (url, body = {}) => request('POST', base + url, body, getHeaders()),
    patch: (url, body) => request('PATCH', base + url, body, getHeaders()),
    del: (url) => request('DELETE', base + url, undefined, getHeaders()),
    upload(url, file) {
      const form = new FormData();
      form.append('file', file);
      return request('POST', base + url, form, getHeaders());
    },
  };
}
