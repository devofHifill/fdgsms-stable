const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

if (!API_BASE) {
  throw new Error("VITE_API_URL is not defined");
}

// Fired when the server rejects our saved login (expired or invalid token).
// AuthContext listens and signs out, which sends the user to /login.
export const AUTH_EXPIRED_EVENT = "fdgsms:auth-expired";

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem("token");

  const headers = {
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  // A 401 on a request that carried our token means the login is no longer
  // valid. (The login call itself sends no token, so a wrong password there
  // just shows its error.)
  if (response.status === 401 && token) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }

  if (!response.ok) {
    const error = new Error(data.message || "Request failed");
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}