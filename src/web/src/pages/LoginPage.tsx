import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { canAccessAnalyzeAndRegistry } from '@/constants/roles'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const loc = useLocation()
  const from = (loc.state as { from?: string } | null)?.from

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setErr(null)
    setBusy(true)
    try {
      const u = await login(username, password)
      if (from) {
        navigate(from, { replace: true })
        return
      }
      if (u.role === 'admin') navigate('/dashboard', { replace: true })
      else if (canAccessAnalyzeAndRegistry(u.role)) navigate('/analyze', { replace: true })
      else navigate('/public', { replace: true })
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel login-panel">
      <h2 className="panel-title">Вход</h2>
      <p className="muted" style={{ marginBottom: '1rem' }}>
        Для акима или администратора — логин и пароль. Граждане могут{' '}
        <Link to="/register">зарегистрироваться</Link> или пользоваться разделом «Горожанам» без входа.
      </p>
      {err ? <p className="error panel-inline-err">{err}</p> : null}
      <label className="field">
        <span>Логин</span>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
        />
      </label>
      <label className="field">
        <span>Пароль</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
        />
      </label>
      <button type="button" disabled={busy || !username || !password} onClick={() => void submit()}>
        {busy ? 'Вход…' : 'Войти'}
      </button>
    </section>
  )
}
