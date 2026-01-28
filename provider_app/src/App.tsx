import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import SetupWizard from './routes/SetupWizard';
import Dashboard from './routes/Dashboard';

function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <h1>Runit Provider</h1>
          <p style={{ color: '#94a3b8', margin: '6px 0 0' }}>Desktop shell</p>
        </div>
        <div className="nav-group">
          <NavLink className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} to="/setup">
            Setup wizard
          </NavLink>
          <NavLink className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} to="/dashboard">
            Dashboard
          </NavLink>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/setup" element={<SetupWizard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="*" element={<Navigate to="/setup" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
