import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Login({ onLoggedIn }) {
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .listLoginUsers()
      .then((list) => {
        setUsers(list);
        if (list.length) setEmail(list[0].email);
      })
      .catch(() => setError('Could not load the user list. Is the server running?'));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api.login(email, pin);
      onLoggedIn(res.user);
    } catch (err) {
      setError(err.message || 'Sign-in failed.');
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="brand-mark">✓</span>
          <h1>TCMS</h1>
        </div>
        <p className="login-sub">Test Case Management — sign in to continue</p>

        <label className="field">
          <span>Who are you?</span>
          <select value={email} onChange={(e) => setEmail(e.target.value)}>
            {users.map((u) => (
              <option key={u.email} value={u.email}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>PIN</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Enter your PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoFocus
          />
        </label>

        {error && <div className="login-error">{error}</div>}

        <button className="btn btn-primary btn-block" disabled={busy || !email}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="login-hint">
          Internal pilot — your PIN is configured by your admin in the server
          <code>.env</code>.
        </p>
      </form>
    </div>
  );
}
