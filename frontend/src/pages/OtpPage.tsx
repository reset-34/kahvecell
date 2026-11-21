import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authApi, getErrorMessage, saveTokens } from '../lib/api'
import { EmptyState } from '../components/PageStates'
import { useToast } from '../components/useToast'

export function OtpPage() {
  const [searchParams] = useSearchParams()
  const phone = searchParams.get('phone') ?? ''
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const showToast = useToast()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    try {
      const tokens = await authApi.verifyOtp({
        phone_number: phone,
        otp_code: otp,
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
        <p className="auth-eyebrow">Telefon doğrulama</p>
        <h1>Kodunu gir</h1>
        <p>Telefonuna gelen 4 haneli kodu gir.</p>
      </header>
      {!phone && (
        <EmptyState
          action={<Link className="button" to="/register">Yeniden kayıt ol</Link>}
          message="Doğrulama bağlantısı eksik. Kayıt sayfasına dönüp telefon bilgini yeniden gönder."
          title="Telefon bilgisi bulunamadı"
        />
      )}
      <p className="otp-test-note">
        Test notu: SMS simülasyon kodu her zaman <strong>1234</strong>.
      </p>
      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="verify-otp">4 haneli doğrulama kodu</label>
          <input
            autoComplete="one-time-code"
            autoFocus
            disabled={!phone}
            id="verify-otp"
            inputMode="numeric"
            maxLength={4}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
            pattern="[0-9]{4}"
            placeholder="••••"
            required
            value={otp}
          />
        </div>
        <button
          className="auth-submit"
          disabled={loading || !phone}
          type="submit"
        >
          {loading ? (
            <>
              <span aria-hidden="true" className="button-spinner" />
              Doğrulanıyor…
            </>
          ) : (
            'Telefonu doğrula'
          )}
        </button>
      </form>
      <p className="auth-switch">
        Bilgileri değiştirmek mi istiyorsun? <Link to="/register">Geri dön</Link>
      </p>
    </div>
  )
}
