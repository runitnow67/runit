function Dashboard() {
  const sessions = [
    { id: 'sess-018', status: 'running', runtime: '42m', earnings: '$3.10' },
    { id: 'sess-017', status: 'completed', runtime: '1h 12m', earnings: '$5.40' },
    { id: 'sess-016', status: 'cleanup', runtime: '5m', earnings: '$0.25' }
  ];

  return (
    <div className="wizard" style={{ maxWidth: '1100px' }}>
      <div className="hero card">
        <div>
          <h2>Dashboard</h2>
          <p style={{ color: '#94a3b8' }}>Monitor the provider, tweak limits, and stream logs.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" type="button">Start provider</button>
          <button className="btn secondary" type="button">Stop provider</button>
        </div>
      </div>

      <div className="panel-grid">
        <div className="card">
          <h3>Account</h3>
          <div className="kv">
            <span>Email</span>
            <span style={{ color: '#e5e7eb' }}>Not signed in</span>
            <span>Token</span>
            <span className="chip">Not stored</span>
            <span>Status</span>
            <span className="chip">Offline</span>
          </div>
        </div>
        <div className="card">
          <h3>Compute caps</h3>
          <div className="kv">
            <span>vCPUs</span>
            <span style={{ color: '#e5e7eb' }}>4</span>
            <span>Memory</span>
            <span style={{ color: '#e5e7eb' }}>16 GB</span>
            <span>GPU</span>
            <span style={{ color: '#e5e7eb' }}>Auto</span>
          </div>
          <button className="btn secondary" type="button" style={{ marginTop: 12 }}>Quick edit</button>
        </div>
        <div className="card">
          <h3>Earnings</h3>
          <div className="kv">
            <span>Today</span>
            <span style={{ color: '#34d399' }}>$0.00</span>
            <span>Last 7d</span>
            <span style={{ color: '#34d399' }}>$0.00</span>
            <span>Pending</span>
            <span style={{ color: '#94a3b8' }}>$0.00</span>
          </div>
        </div>
        <div className="card">
          <h3>Pricing</h3>
          <div className="kv">
            <span>vCPU rate</span>
            <span style={{ color: '#e5e7eb' }}>$0.08/hr</span>
            <span>Memory rate</span>
            <span style={{ color: '#e5e7eb' }}>$0.01/GB-hr</span>
            <span>Preset</span>
            <span className="tag">Balanced</span>
          </div>
          <button className="btn secondary" type="button" style={{ marginTop: 12 }}>Edit pricing</button>
        </div>
      </div>

      <div className="card">
        <div className="step-header" style={{ padding: 0, border: 'none', background: 'transparent' }}>
          <h3 style={{ margin: 0 }}>Recent sessions</h3>
          <button className="btn secondary" type="button">Refresh</button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Status</th>
              <th>Runtime</th>
              <th>Earnings</th>
              <th>Logs</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>{s.id}</td>
                <td><span className="chip">{s.status}</span></td>
                <td>{s.runtime}</td>
                <td>{s.earnings}</td>
                <td><button className="btn secondary" type="button">View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Dashboard;
