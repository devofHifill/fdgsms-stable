import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AppLayout from "../components/AppLayout";

const PATHS = {
  inbox: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  contacts: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5-5 5 5"/><path d="M12 5v12"/>',
  campaigns: '<path d="M3 11l18-5v12L3 14v-3z"/>',
  enrollments: '<circle cx="6" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  settings: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  logs: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
};

function Icon({ name }) {
  return (
    <svg
      width="20"
      height="20"
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

const LINKS = [
  { to: "/inbox", icon: "inbox", title: "Inbox", desc: "Manage two-way SMS conversations" },
  { to: "/contacts", icon: "contacts", title: "Contacts", desc: "Browse and enroll your contact list" },
  { to: "/upload", icon: "upload", title: "Import Contacts", desc: "Upload CSV / Excel and preview rows" },
  { to: "/campaigns", icon: "campaigns", title: "Campaigns", desc: "Build automated message sequences" },
  { to: "/enrollments", icon: "enrollments", title: "Enrollments", desc: "Track automation status and progress" },
  { to: "/settings", icon: "settings", title: "Automation Settings", desc: "Sending window and rate limits" },
  { to: "/logs", icon: "logs", title: "System Logs", desc: "Activity, failures, and events" },
];

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <AppLayout>
      <div className="dash-hero">
        <h1>Dashboard</h1>
        <p>
          Welcome back{user?.email ? `, ${user.email}` : ""}. Your Phase 8
          automation is connected to campaigns, enrollments, and settings —
          jump into any section below.
        </p>
      </div>

      <div className="quick-grid">
        {LINKS.map((link) => (
          <Link key={link.to} to={link.to} className="quick-card">
            <span className="q-ico">
              <Icon name={link.icon} />
            </span>
            <div>
              <h3>{link.title}</h3>
              <p>{link.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </AppLayout>
  );
}
