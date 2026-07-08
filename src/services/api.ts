// In dev, Vite proxies /api → http://localhost:5000, eliminating CORS issues.
// In production, set VITE_API_URL to the deployed backend URL.
const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

// ── Generic fetch wrapper ───────────────────────────────────────────────────
async function apiFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('auth_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || 'Something went wrong.');
  }
  return data;
}

// ── Auth API ────────────────────────────────────────────────────────────────
export const authAPI = {
  signup: (username: string, email: string, password: string) =>
    apiFetch('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    }),

  login: (email: string, password: string) =>
    apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => apiFetch('/auth/me'),

  getHistory: () => apiFetch('/auth/history'),

  saveHistory: (chatHistory: unknown[]) =>
    apiFetch('/auth/history', {
      method: 'PUT',
      body: JSON.stringify({ chatHistory }),
    }),
};
