// Thin wrapper around fetch. All calls are same-origin (cookies sent
// automatically) and JSON. On error, throws an Error whose `.status` and
// `.payload` carry the server response (used for 409 conflict handling).

async function request(method, url, body) {
  const opts = {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  let payload = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    const err = new Error(payload?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}

export const api = {
  // Auth
  listLoginUsers: () => request('GET', '/api/users'),
  login: (email, pin) => request('POST', '/api/auth/login', { email, pin }),
  logout: () => request('POST', '/api/auth/logout'),
  me: () => request('GET', '/api/auth/me'),

  // Metadata
  meta: () => request('GET', '/api/meta'),

  // Test cases
  listTestCases: () => request('GET', '/api/test-cases'),
  createTestCase: (data) => request('POST', '/api/test-cases', data),
  updateTestCase: (id, data) => request('PUT', `/api/test-cases/${id}`, data),
  setPinned: (id, pinned) =>
    request('POST', `/api/test-cases/${id}/pin`, { pinned }),
  deleteTestCase: (id) => request('DELETE', `/api/test-cases/${id}`),
  duplicateTestCase: (id) =>
    request('POST', `/api/test-cases/${id}/duplicate`),
  bulkUpdate: (ids, patch) =>
    request('POST', '/api/test-cases/bulk/update', { ids, ...patch }),
  bulkDelete: (ids) =>
    request('POST', '/api/test-cases/bulk/delete', { ids }),
};
