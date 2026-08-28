const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const TOKEN_KEY = 'sautiledger.token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection.');
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    if (response.status === 401) setToken(null);
    throw new ApiError(response.status, payload.message || 'Something went wrong.');
  }

  return payload;
}

export const api = {
  signup: (body) => request('/api/auth/signup', { method: 'POST', body, auth: false }),
  login: (body) => request('/api/auth/login', { method: 'POST', body, auth: false }),
  guest: (body = {}) => request('/api/auth/guest', { method: 'POST', body, auth: false }),
  me: () => request('/api/auth/me'),
  updateBusiness: (body) => request('/api/auth/business', { method: 'PATCH', body }),

  listItems: (params = {}) => {
    const search = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== '' && value != null)
    );
    return request(`/api/items${search.toString() ? `?${search}` : ''}`);
  },
  createItem: (body) => request('/api/items', { method: 'POST', body }),
  updateItem: (id, body) => request(`/api/items/${id}`, { method: 'PATCH', body }),
  deleteItem: (id) => request(`/api/items/${id}`, { method: 'DELETE' }),

  listCustomers: (search = '') =>
    request(`/api/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  createCustomer: (body) => request('/api/customers', { method: 'POST', body }),
  getCustomer: (id) => request(`/api/customers/${id}`),
  recordRepayment: (id, body) => request(`/api/customers/${id}/repayment`, { method: 'POST', body }),

  parseIntent: (transcript) =>
    request('/api/parse-intent', { method: 'POST', body: { transcript }, auth: false }),
  recordTransaction: (intent) => request('/api/transaction', { method: 'POST', body: intent }),
  listTransactions: (scope = 'today') => request(`/api/transactions?scope=${scope}`),
  undoTransaction: (batchId) => request(`/api/transactions/${batchId}/undo`, { method: 'POST' }),

  dashboard: () => request('/api/dashboard'),
  reports: (params) => request(`/api/reports?${new URLSearchParams(params)}`),
  ask: (question) => request('/api/assistant', { method: 'POST', body: { question } }),
};
