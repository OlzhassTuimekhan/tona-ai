import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export default function RegisterPage() {
  const { t } = useTranslation()
  const { register } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [district, setDistrict] = useState('')
  const [city, setCity] = useState('')
  const [region, setRegion] = useState('')
  const [phone, setPhone] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setErr(null)
    setBusy(true)
    try {
      await register({
        username: username.trim(),
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        district: district.trim(),
        city: city.trim() || undefined,
        region: region.trim() || undefined,
        phone: phone.trim() || undefined,
      })
      navigate('/public', { replace: true })
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel login-panel">
      <h2 className="panel-title">{t('register.title')}</h2>
      <p className="muted" style={{ marginBottom: '1rem' }}>
        {t('register.leadPrefix')} <Link to="/login">{t('register.loginLink')}</Link>
        {t('register.leadSuffix')}
      </p>
      {err ? <p className="error panel-inline-err">{err}</p> : null}
      <div className="admin-form-grid">
        <label className="field">
          <span>{t('register.username')}</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="field">
          <span>{t('register.password')}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label className="field">
          <span>{t('register.firstName')}</span>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
          />
        </label>
        <label className="field">
          <span>{t('register.lastName')}</span>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
          />
        </label>
        <label className="field">
          <span>{t('register.district')}</span>
          <input
            type="text"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            placeholder={t('register.districtPh')}
          />
        </label>
        <label className="field">
          <span>{t('register.cityOpt')}</span>
          <input type="text" value={city} onChange={(e) => setCity(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('register.regionOpt')}</span>
          <input type="text" value={region} onChange={(e) => setRegion(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('register.phoneOpt')}</span>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
        </label>
      </div>
      <button
        type="button"
        disabled={
          busy ||
          !username.trim() ||
          password.length < 6 ||
          !firstName.trim() ||
          !lastName.trim() ||
          !district.trim()
        }
        onClick={() => void submit()}
      >
        {busy ? t('register.busy') : t('register.submit')}
      </button>
    </section>
  )
}
