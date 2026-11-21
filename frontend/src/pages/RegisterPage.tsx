import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi, getErrorMessage } from '../lib/api'
import { useToast } from '../components/useToast'

export function RegisterPage() {
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const showToast = useToast()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    try {
      const result = await authApi.register({
        phone_number: phone,
        full_name: name,
        password,
      })
      navigate(`/verify-otp?phone=${encodeURIComponent(result.phone_number)}`)
    } catch (requestError) {
      showToast(getErrorMessage(requestError), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-content">
      <header className="auth-heading">
        <p className="auth-eyebrow">Kahve keyfin burada başlasın</p>
        <h1>Hesap oluştur</h1>
        <p>Aramıza katılmak için bilgilerini doldur.</p>
      </header>
      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="register-name">Ad soyad</label>
          <input
            autoComplete="name"
            id="register-name"
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </div>
        <div className="form-field">
          <label htmlFor="register-phone">Telefon numarası</label>
          <input
            autoComplete="tel"
            id="register-phone"
            onChange={(event) => setPhone(event.target.value)}
            pattern="05[0-9]{9}"
            placeholder="05XXXXXXXXX"
            required
            title="05 ile başlayan 11 haneli telefon numaranızı girin."
            type="tel"
            value={phone}
          />
        </div>
        <div className="form-field">
          <label htmlFor="register-password">Şifre</label>
          <input
            autoComplete="new-password"
            id="register-password"
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          <small className="field-hint">En az 8 karakter olmalı.</small>
        </div>
        <button className="auth-submit" disabled={loading} type="submit">
          {loading ? (
            <>
              <span aria-hidden="true" className="button-spinner" />
              Hesap oluşturuluyor…
            </>
          ) : (
            'Kayıt ol'
          )}
        </button>
      </form>
      <p className="auth-switch">
        Zaten hesabın var mı? <Link to="/login">Giriş yap</Link>
      </p>
    </div>
  )
}
