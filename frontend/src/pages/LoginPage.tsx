import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi, getErrorMessage, saveTokens } from '../lib/api'
import { useToast } from '../components/useToast'

export function LoginPage() {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const showToast = useToast()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    try {
      const tokens = await authApi.login({
        phone_number: phone,
        password,
      })
      saveTokens(tokens)
      navigate(tokens.user.role === 'SHOP_OWNER' ? '/owner/orders' : '/')
    } catch (requestError) {
      showToast(getErrorMessage(requestError), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-content">
      <header className="auth-heading">
        <p className="auth-eyebrow">Yeniden hoş geldin</p>
        <h1>Giriş yap</h1>
        <p>Hesabına devam etmek için bilgilerini gir.</p>
      </header>
      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="login-phone">Telefon numarası</label>
          <input
            autoComplete="tel"
            id="login-phone"
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
          <label htmlFor="login-password">Şifre</label>
          <input
            autoComplete="current-password"
            id="login-password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </div>
        <button className="auth-submit" disabled={loading} type="submit">
          {loading ? (
            <>
              <span aria-hidden="true" className="button-spinner" />
              Giriş yapılıyor…
            </>
          ) : (
            'Giriş yap'
          )}
        </button>
      </form>
      <p className="auth-switch">
        Henüz hesabın yok mu? <Link to="/register">Kayıt ol</Link>
      </p>
    </div>
  )
}
