import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../services/api";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const data = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify(form),
      });

      login({
        token: data.token,
        user: data.user,
      });

      navigate("/");
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth">
      <aside className="auth-side">
        <div className="auth-brand">
          <div className="brand-mark">F</div>
          <div className="brand-text">
            <span className="brand-name">FDGSMS</span>
            <span className="brand-sub">SMS Automation</span>
          </div>
        </div>

        <div className="auth-hero">
          <h2>Two-way SMS automation that converts.</h2>
          <p>
            Run drip campaigns, manage replies in a unified inbox, and track
            every enrollment — all in one place.
          </p>
          <div className="auth-features">
            <div className="auth-feature">
              <span className="dot" /> Automated multi-step sequences
            </div>
            <div className="auth-feature">
              <span className="dot" /> WhatsApp-style two-way inbox
            </div>
            <div className="auth-feature">
              <span className="dot" /> Real-time delivery &amp; reply tracking
            </div>
          </div>
        </div>

        <div className="auth-copy">© 2026 Fill Design Group</div>
      </aside>

      <main className="auth-main">
        <form className="login-card" onSubmit={handleSubmit}>
          <h1>Welcome back</h1>

          <label>Email</label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="Enter admin email"
            required
          />

          <label>Password</label>
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            placeholder="Enter password"
            required
          />

          {error ? <p className="login-error">{error}</p> : null}

          <button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>
      </main>
    </div>
  );
}
