import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useApi } from '../hooks';
import type { RegistrationInfo } from '../types';
import { Link, navigate } from '../router';
import { useApp } from '../store';

export function Register() {
  const { register, notify } = useApp();
  const { data: reg } = useApi(() => api<RegistrationInfo>('/public/registration'), []);
  const [form, setForm] = useState({ name: '', rollNo: '', email: '', year: 'FE', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const err = await register(form);
    setBusy(false);
    if (err) {
      setError(err);
      notify('error', err);
      return;
    }
    notify('success', 'Registration successful! Welcome to CodeSmash 2.0.');
    navigate('/dashboard');
  };

  if (reg && !reg.open) {
    return (
      <div className="container section auth">
        <div className="card form center-text">
          <h2>Registration is closed</h2>
          <p className="muted">
            {reg.deadlinePassed ? 'The registration deadline has passed.' : 'The organisers have closed registration.'} If you
            want to take part, please contact the organisers at the venue — they can register you on the spot.
          </p>
          <p className="muted">Already registered? <Link to="/login">Login</Link></p>
        </div>
      </div>
    );
  }

  return (
    <div className="container section auth">
      <form className="card form" onSubmit={submit}>
        <h2>Register</h2>
        {reg?.closesAt && <div className="alert alert-info">Registration closes on {new Date(reg.closesAt).toLocaleString()}.</div>}
        <p className="muted">Create your participant profile. You will log in with your roll number and password.</p>
        {error && <div className="alert alert-error">{error}</div>}
        <label className="field">
          <span>Full name</span>
          <input value={form.name} onChange={set('name')} placeholder="e.g. Aarav Patil" required />
        </label>
        <label className="field">
          <span>Roll number / PRN</span>
          <input value={form.rollNo} onChange={set('rollNo')} placeholder="e.g. CSE2024-042" required />
        </label>
        <label className="field">
          <span>Email (optional – results can also be emailed)</span>
          <input type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" />
        </label>
        <label className="field">
          <span>Year</span>
          <select value={form.year} onChange={set('year')}>
            <option value="FE">First Year (FE)</option>
            <option value="SE">Second Year (SE)</option>
            <option value="TE">Third Year (TE)</option>
            <option value="BE">Final Year (BE)</option>
          </select>
        </label>
        <label className="field">
          <span>Password (min 6 characters)</span>
          <input type="password" value={form.password} onChange={set('password')} minLength={6} required />
        </label>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'Creating account…' : 'Register'}
        </button>
        <p className="muted center-text">
          Already registered? <Link to="/login">Login</Link>
        </p>
      </form>
    </div>
  );
}

export function Login() {
  const { login, notify, registrationOpen } = useApp();
  const [rollNo, setRollNo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const err = await login(rollNo, password);
    setBusy(false);
    if (err) {
      setError(err);
      notify('error', err);
      return;
    }
    notify('success', 'Logged in successfully.');
    navigate('/dashboard');
  };

  return (
    <div className="container section auth">
      <form className="card form" onSubmit={submit}>
        <h2>Participant Login</h2>
        {error && <div className="alert alert-error">{error}</div>}
        <label className="field">
          <span>Roll number / PRN</span>
          <input value={rollNo} onChange={(e) => setRollNo(e.target.value)} placeholder="e.g. CSE2024-042" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'Logging in…' : 'Login'}
        </button>
        <p className="muted center-text">
          {registrationOpen && (<>New here? <Link to="/register">Register</Link> · </>)}Organiser? <Link to="/admin">Admin login</Link>
        </p>
      </form>
    </div>
  );
}
