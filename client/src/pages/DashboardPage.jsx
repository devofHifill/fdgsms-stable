import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function DashboardPage() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <h2>FDGSMS</h2>
          <p>{user?.email}</p>

          <nav className="sidebar-nav">
            <Link to="/">Dashboard</Link>
            <Link to="/upload">Import Contacts</Link>
            <Link to="/contacts">Contacts</Link>
            <Link to="/inbox">Inbox</Link>
            <Link to="/campaigns">Campaigns</Link>
            <Link to="/enrollments">Enrollments</Link>
            <Link to="/settings">Automation Settings</Link>
            <Link to="/logs">Logs</Link>
          </nav>
        </div>

        <button onClick={logout}>Logout</button>
      </aside>

      <main className="chat-panel">
        <h1>Dashboard</h1>
        <p>Phase 8 automation UI is now connected to campaigns, enrollments, and settings.</p>
      </main>
    </div>
  );
}