import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AppLayout({ children }) {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <h2>FDGSMS</h2>
          <p>{user?.email}</p>

          <nav className="sidebar-nav">
            <NavLink to="/" end>Dashboard</NavLink>
            <NavLink to="/upload">Import Contacts</NavLink>
            <NavLink to="/contacts">Contacts</NavLink>
            <NavLink to="/inbox">Inbox</NavLink>
            <NavLink to="/campaigns">Campaigns</NavLink>
            <NavLink to="/enrollments">Enrollments</NavLink>
            <NavLink to="/settings">Automation Settings</NavLink>
            <NavLink to="/logs">Logs</NavLink>
          </nav>
        </div>

        <button onClick={logout}>Logout</button>
      </aside>

      <main className="chat-panel">
        {children}
      </main>
    </div>
  );
}