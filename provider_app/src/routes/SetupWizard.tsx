import { useMemo, useState } from 'react';

function SignInStep() {
  return (
    <div className="step-body card">
      <div className="hero">
        <div>
          <h2>Sign in with GitHub or Google</h2>
          <p style={{ color: '#94a3b8' }}>
            Launch the OAuth webview, complete consent, and we will stash the token in your OS keychain.
          </p>
        </div>
        <div className="tag">Secure storage</div>
      </div>
      <div className="list-row">
        <span>Open OAuth webview</span>
        <button className="btn secondary" type="button">Launch</button>
      </div>
      <div className="list-row">
        <span>Token status</span>
        <span className="chip">Not connected</span>
      </div>
    </div>
  );
}

function PrereqCheckStep() {
  const items = [
    { label: 'Docker engine', status: 'Pending' },
    { label: 'runit-jupyter image', status: 'Not pulled' },
    { label: 'Disk space', status: 'OK' }
  ];

  return (
    <div className="step-body card">
      <h3>Prerequisite check</h3>
      <p style={{ color: '#94a3b8' }}>Detect/install Docker, pull/build the runtime image, and verify disk space.</p>
      {items.map((item) => (
        <div key={item.label} className="list-row">
          <span>{item.label}</span>
          <span className="chip">{item.status}</span>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn" type="button">Run checks</button>
        <button className="btn secondary" type="button">View logs</button>
      </div>
    </div>
  );
}

function HardwareDetectStep() {
  const hints = [
    ['CPU', '12 cores (8 performance + 4 efficiency)'],
    ['RAM', '32 GB installed'],
    ['Disk', '1 TB, 400 GB free'],
    ['GPU', 'M2 GPU (if applicable)']
  ];

  return (
    <div className="step-body card">
      <h3>Hardware detection</h3>
      <p style={{ color: '#94a3b8' }}>Use detect_hardware to read the host profile and suggest conservative limits.</p>
      <div className="kv">
        {hints.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <div>{k}</div>
            <div style={{ color: '#e5e7eb' }}>{v}</div>
          </div>
        ))}
      </div>
      <div className="list-row">
        <span>Recommended preset</span>
        <span className="tag">Balanced</span>
      </div>
    </div>
  );
}

function PricingStep() {
  const [vcpus, setVcpus] = useState(4);
  const [memory, setMemory] = useState(16);
  const price = useMemo(() => (vcpus * 0.08 + memory * 0.01).toFixed(2), [vcpus, memory]);

  return (
    <div className="step-body card">
      <h3>Live pricing preview</h3>
      <p style={{ color: '#94a3b8' }}>Adjust limits and preview earnings in real time.</p>
      <div className="slider-row">
        <label>vCPUs: {vcpus}</label>
        <input type="range" min={2} max={16} value={vcpus} onChange={(e) => setVcpus(Number(e.target.value))} />
      </div>
      <div className="slider-row">
        <label>Memory (GB): {memory}</label>
        <input type="range" min={4} max={64} step={4} value={memory} onChange={(e) => setMemory(Number(e.target.value))} />
      </div>
      <div className="list-row">
        <span>Estimated hourly price</span>
        <strong style={{ color: '#34d399' }}>${price}/hr</strong>
      </div>
    </div>
  );
}

function ConfirmStep() {
  const checklist = [
    'Store token in OS keychain',
    'Persist limits and pricing',
    'Enable agent supervision',
    'Run initial heartbeat'
  ];

  return (
    <div className="step-body card">
      <h3>Confirm & finalize</h3>
      <p style={{ color: '#94a3b8' }}>Review the plan and launch the provider.</p>
      {checklist.map((item) => (
        <div key={item} className="list-row">
          <span>{item}</span>
          <span className="chip">Pending</span>
        </div>
      ))}
      <button className="btn" type="button">Finish and start</button>
    </div>
  );
}

const steps = [
  { id: 'signin', title: 'Sign in', component: <SignInStep /> },
  { id: 'prereq', title: 'Prereq check', component: <PrereqCheckStep /> },
  { id: 'hardware', title: 'Hardware detect', component: <HardwareDetectStep /> },
  { id: 'pricing', title: 'Live pricing', component: <PricingStep /> },
  { id: 'confirm', title: 'Confirm', component: <ConfirmStep /> }
];

function SetupWizard() {
  const [index, setIndex] = useState(0);
  const step = steps[index];

  return (
    <div className="wizard">
      <div className="step-header">
        <div>
          <div className="stepper">
            {steps.map((s, i) => (
              <span key={s.id} className={i === index ? 'step-pill active' : 'step-pill'}>
                {i + 1}. {s.title}
              </span>
            ))}
          </div>
          <p style={{ color: '#94a3b8', margin: '8px 0 0' }}>Guided setup for the provider desktop.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn secondary" type="button" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
            Back
          </button>
          <button className="btn" type="button" onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))}>
            {index === steps.length - 1 ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
      {step.component}
    </div>
  );
}

export default SetupWizard;
