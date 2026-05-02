import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { updateProfile, type ProfileUpdate } from '@/api/client'
import { useAuth } from '@/context/AuthContext'

export default function ProfilePage() {
  const { t } = useTranslation()
  const { user, refresh } = useAuth()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [district, setDistrict] = useState('')
  const [city, setCity] = useState('')
  const [region, setRegion] = useState('')
  const [phone, setPhone] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    setFirstName(user.first_name ?? '')
    setLastName(user.last_name ?? '')
    setDistrict(user.district ?? '')
    setCity(user.city ?? '')
    setRegion(user.region ?? '')
    setPhone(user.phone ?? '')
  }, [user])

  if (!user) {
    return null
  }

  const save = async () => {
    setErr(null)
    setOk(false)
    setBusy(true)
    try {
      const body: ProfileUpdate = {
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        district: district.trim() || undefined,
        city: city.trim() || null,
        region: region.trim() || null,
        phone: phone.trim() || null,
      }
      await updateProfile(body)
      await refresh()
      setOk(true)
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel">
      <h2 className="panel-title">{t('profile.title')}</h2>
      <p className="muted">
        <span className={`role-pill ${user.role}`}>{user.role}</span> · {user.username}
      </p>
      {(user.role === 'admin' || user.role === 'akim') && user.org ? (
        <p className="muted">
          {t('profile.orgNote')} <strong>{user.org}</strong>
        </p>
      ) : null}

      {err ? <p className="error panel-inline-err">{err}</p> : null}
      {ok ? (
        <p className="muted" style={{ color: 'var(--accent)' }}>
          {t('profile.saved')}
        </p>
      ) : null}

      <h3 className="subh" style={{ marginTop: '1.25rem' }}>
        {t('profile.personal')}
      </h3>
      <div className="admin-form-grid admin-form-grid--two profile-form-grid">
        <label className="field">
          <span>{t('profile.firstName')}</span>
          <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('profile.lastName')}</span>
          <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('profile.district')}</span>
          <input type="text" value={district} onChange={(e) => setDistrict(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('profile.city')}</span>
          <input type="text" value={city} onChange={(e) => setCity(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('profile.region')}</span>
          <input type="text" value={region} onChange={(e) => setRegion(e.target.value)} />
        </label>
        <label className="field">
          <span>{t('profile.phone')}</span>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
      </div>
      <button type="button" className="btn-block profile-save-btn" disabled={busy} onClick={() => void save()}>
        {busy ? t('profile.saving') : t('profile.save')}
      </button>
    </section>
  )
}
