import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { Spinner } from '../../components/ui';
import { LogIn } from 'lucide-react';
import './login.css';

export function LoginPage() {
  const { login } = useAuth();
  const [l, setL] = useState('owner');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await login(l.trim(), p);
    } catch (e) {
      setErr((e as Error).message || 'Не удалось войти');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-aside" aria-hidden>
        <div className="login-aside-inner">
          <img className="login-logo login-logo-light" src="/emt-logo-light-theme.png" alt="EMT Service" />
          <img className="login-logo login-logo-dark" src="/emt-logo-dark-theme.png" alt="EMT Service" />
          <div className="login-aside-text">
            <span className="login-eyebrow">MINI Cooper · сервис</span>
            <p>Клиенты, авто, заказ-наряды и сметы — в одном тихом инструменте.</p>
          </div>
        </div>
      </div>

      <div className="login-panel">
        <form className="login-form" onSubmit={submit}>
          <h2>Вход в систему</h2>
          <p className="muted text-sm">Введите логин и пароль владельца</p>

          <div className="field" style={{ marginTop: 'var(--sp-2)' }}>
            <label className="label" htmlFor="login">Логин</label>
            <input id="login" className="input" value={l} onChange={(e) => setL(e.target.value)} autoComplete="username" autoFocus />
          </div>
          <div className="field">
            <label className="label" htmlFor="pw">Пароль</label>
            <input id="pw" className="input" type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" placeholder="••••••••" />
          </div>

          {err && <div className="field-error" role="alert">{err}</div>}

          <button className="btn btn-primary" type="submit" disabled={busy} style={{ marginTop: 'var(--sp-2)' }}>
            {busy ? <Spinner /> : <LogIn size={16} />}
            Войти
          </button>
        </form>
      </div>
    </div>
  );
}
