import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import './Layout.css';

export default function Layout({ children }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="layout">
      <header className="topbar">
        <NavLink to="/map" className="brand">
          <span className="brand-name">Our Threads</span>
          <span className="brand-sub">A record of encounters</span>
        </NavLink>
        <nav className="topnav">
          <NavLink to="/map" className={({ isActive }) => isActive ? 'active' : ''}>Map</NavLink>
          <NavLink to="/threads" className={({ isActive }) => isActive ? 'active' : ''}>Threads</NavLink>
          <button className="logout-btn" onClick={handleLogout}>Sign out</button>
        </nav>
      </header>
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
