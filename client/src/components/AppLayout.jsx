import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../services/api";

/* Inline icons (no external icon-lib version risk) */
const PATHS = {
  dashboard: '<path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"/>',
  inbox: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  contacts: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5-5 5 5"/><path d="M12 5v12"/>',
  campaigns: '<path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  enrollments: '<path d="M6 3v12"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  settings: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  logs: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h8M8 9h2"/>',
  ai: '<rect x="4" y="7" width="16" height="12" rx="2"/><path d="M9 3v4M15 3v4M9 13h.01M15 13h.01M1 12h3M20 12h3"/>',
  analytics: '<path d="M3 3v18h18"/><path d="M8 17v-4M13 17V8M18 17v-7"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.2" y1="4.2" x2="5.6" y2="5.6"/><line x1="18.4" y1="18.4" x2="19.8" y2="19.8"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.2" y1="19.8" x2="5.6" y2="18.4"/><line x1="18.4" y1="5.6" x2="19.8" y2="4.2"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
  menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
};

function Icon({ name, size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: PATHS[name] || "" }}
    />
  );
}

const NAV = [
  {
    group: "Main",
    items: [
      { to: "/", end: true, label: "Dashboard", icon: "dashboard" },
      { to: "/inbox", label: "Inbox", icon: "inbox" },
      { to: "/contacts", label: "Contacts", icon: "contacts" },
      { to: "/upload", label: "Import Contacts", icon: "upload" },
    ],
  },
  {
    group: "Automation",
    items: [
      { to: "/campaigns", label: "Campaigns", icon: "campaigns" },
      { to: "/enrollments", label: "Enrollments", icon: "enrollments" },
      { to: "/settings", label: "Automation Settings", icon: "settings" },
    ],
  },
  {
    group: "AI Reply System",
    items: [
      { to: "/ai-settings", label: "AI Settings", icon: "ai" },
      { to: "/ai-analytics", label: "AI Analytics", icon: "analytics" },
    ],
  },
  {
    group: "System",
    items: [{ to: "/logs", label: "Logs", icon: "logs" }],
  },
];

export default function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("fdg-theme") || "dark";
    } catch {
      return "dark";
    }
  });

  const [unread, setUnread] = useState(0);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("fdg-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  // Poll the unread-conversation count for the Inbox nav badge.
  useEffect(() => {
    let alive = true;
    async function loadUnread() {
      try {
        const data = await apiFetch("/conversations/unread-count");
        if (alive) setUnread(Number(data?.total) || 0);
      } catch {
        /* ignore — badge just stays as-is */
      }
    }
    loadUnread();
    const id = setInterval(loadUnread, 20000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const initials = (user?.email || "AD").slice(0, 2).toUpperCase();

  return (
    <div className={`app-shell ${navOpen ? "nav-open" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">F</div>
          <div className="brand-text">
            <span className="brand-name">FDGSMS</span>
            <span className="brand-sub">SMS Automation</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV.map((section) => (
            <div key={section.group}>
              <p className="nav-group-title">{section.group}</p>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  title={item.label}
                  onClick={() => setNavOpen(false)}
                >
                  <span className="nav-ico">
                    <Icon name={item.icon} />
                  </span>
                  <span className="nav-label">{item.label}</span>
                  {item.to === "/inbox" && unread > 0 ? (
                    <span className="nav-badge">{unread}</span>
                  ) : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            title="Toggle color theme"
          >
            <span className="nav-ico">
              <Icon name={theme === "dark" ? "sun" : "moon"} />
            </span>
            <span className="nav-label">
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </span>
          </button>

          <div className="user-card">
            <div className="avatar">{initials}</div>
            <div className="user-meta">
              <span className="user-name">Admin</span>
              <span className="user-mail">{user?.email || "signed in"}</span>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={logout}
              title="Logout"
              aria-label="Logout"
            >
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </aside>

      <div className="scrim" onClick={() => setNavOpen(false)} />

      <button
        type="button"
        className="icon-btn mobile-menu"
        onClick={() => setNavOpen((v) => !v)}
        title="Menu"
        aria-label="Open navigation"
      >
        <Icon name="menu" />
      </button>

      <main className="chat-panel">{children}</main>
    </div>
  );
}
