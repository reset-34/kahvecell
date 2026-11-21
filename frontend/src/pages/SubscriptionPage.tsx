import axios from 'axios'
import { useEffect, useState, type FormEvent } from 'react'
import { getErrorMessage, subscriptionsApi } from '../lib/api'
import { EmptyState, ErrorState, LoadingState } from '../components/PageStates'
import { useToast } from '../components/useToast'
import type {
  PurchaseResult,
  Subscription,
  SubscriptionPlan,
} from '../types/api'

const TEST_CARD_NUMBER = '4242-4242-4242-4242'

function formatEndDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'long',
  }).format(date)
}

export function SubscriptionPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [plansError, setPlansError] = useState('')
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [subscriptionError, setSubscriptionError] = useState('')
  const [subscriptionExpired, setSubscriptionExpired] = useState(false)
  const [plansLoading, setPlansLoading] = useState(true)
  const [subscriptionLoading, setSubscriptionLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null)
  const [cardNumber, setCardNumber] = useState(TEST_CARD_NUMBER)
  const [cancelConfirmation, setCancelConfirmation] = useState(false)
  const [busy, setBusy] = useState(false)
  const [requestVersion, setRequestVersion] = useState(0)
  const showToast = useToast()

  useEffect(() => {
    let active = true
    subscriptionsApi
      .plans()
      .then((result) => {
        if (active) {
          setPlans(result)
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setPlansError(getErrorMessage(requestError))
        }
      })
      .finally(() => {
        if (active) {
          setPlansLoading(false)
        }
      })

    subscriptionsApi
      .current()
      .then((result) => {
        if (active) {
          setSubscription(result)
          setSubscriptionExpired(Date.parse(result.expires_at) <= Date.now())
        }
      })
      .catch((requestError: unknown) => {
        if (
          axios.isAxiosError(requestError) &&
          requestError.response?.status === 404
        ) {
          if (active) {
            setSubscription(null)
            setSubscriptionExpired(false)
          }
          return
        }
        if (active) {
          setSubscriptionError(getErrorMessage(requestError))
        }
      })
      .finally(() => {
        if (active) {
          setSubscriptionLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [requestVersion])

  function retryData() {
    setPlansLoading(true)
    setSubscriptionLoading(true)
    setPlansError('')
    setSubscriptionError('')
    setRequestVersion((version) => version + 1)
  }

  const hasActiveSubscription =
    subscription?.status === 'ACTIVE' && !subscriptionExpired
  const activePlan = plans.find(
    (plan) => plan.plan_type === subscription?.plan_type,
  )

  function openPurchaseModal(plan: SubscriptionPlan) {
    setSelectedPlan(plan)
    setCardNumber(TEST_CARD_NUMBER)
  }

  async function purchaseSelectedPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedPlan) return

    setBusy(true)
    try {
      let result: PurchaseResult
      if (subscription?.status === 'ACTIVE') {
        if (subscriptionExpired && selectedPlan.plan_type === subscription.plan_type) {
          result = await subscriptionsApi.renew(cardNumber)
        } else {
          result = await subscriptionsApi.change(
            selectedPlan.plan_type,
            cardNumber,
          )
        }
      } else {
        result = await subscriptionsApi.purchase(
          selectedPlan.plan_type,
          cardNumber,
        )
      }

      if (!result.success) {
        showToast(result.message, 'error')
        return
      }
      if (!result.subscription) {
        showToast('Ödeme başarılı görünüyor ancak abonelik bilgisi alınamadı.', 'error')
        return
      }

      setSubscription(result.subscription)
      setSubscriptionExpired(false)
      showToast(result.message, 'success')
      setSelectedPlan(null)
    } catch (requestError: unknown) {
      showToast(getErrorMessage(requestError), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function cancelSubscription() {
    setBusy(true)
    try {
      await subscriptionsApi.cancel()
      setSubscription(null)
      setSubscriptionExpired(false)
      setCancelConfirmation(false)
      showToast('Aboneliğiniz iptal edildi.', 'success')
    } catch (requestError: unknown) {
      showToast(getErrorMessage(requestError), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack subscription-page">
      <header className="page-heading">
        <h1>Aboneliğim</h1>
        <p>Paketini yönet veya sana uygun yeni bir paket seç.</p>
      </header>

      <section className="panel subscription-summary" aria-label="Aktif abonelik">
        <h2>Mevcut aboneliğin</h2>
        {subscriptionLoading ? (
          <LoadingState message="Abonelik bilgisi yükleniyor…" />
        ) : subscriptionError ? (
          <ErrorState
            message={subscriptionError}
            onRetry={retryData}
            title="Abonelik bilgisi alınamadı"
          />
        ) : !hasActiveSubscription || !subscription ? (
          <EmptyState
            message="Aşağıdaki paketlerden birini seçerek kahve hakkı kazanabilirsin."
            title="Aktif aboneliğin yok"
          />
        ) : (
          <>
            <div className="subscription-details">
              <span>
                <strong>Paket</strong>
                {activePlan?.name ?? subscription.plan_type}
              </span>
              <span>
                <strong>Kalan kredi</strong>
                {subscription.remaining_credits === null
                  ? 'Sınırsız'
                  : subscription.remaining_credits}
              </span>
              <span>
                <strong>Bitiş tarihi</strong>
                {formatEndDate(subscription.expires_at)}
              </span>
            </div>
            {!cancelConfirmation ? (
              <button
                className="cancel-subscription-button"
                disabled={busy}
                onClick={() => setCancelConfirmation(true)}
                type="button"
              >
                İptal Et
              </button>
            ) : (
              <div className="cancel-confirmation" role="group">
                <p>Aboneliğini iptal etmek istediğine emin misin?</p>
                <div className="form-actions">
                  <button
                    className="danger-button"
                    disabled={busy}
                    onClick={() => void cancelSubscription()}
                    type="button"
                  >
                    {busy ? 'İptal ediliyor…' : 'İptali Onayla'}
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => setCancelConfirmation(false)}
                    type="button"
                  >
                    Vazgeç
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <section className="stack" aria-label="Abonelik paketleri">
        <header className="page-heading">
          <h2>Paketler</h2>
          <p>Her paket 30 gün boyunca geçerlidir.</p>
        </header>
        {plansLoading ? (
          <LoadingState message="Abonelik paketleri yükleniyor…" />
        ) : plansError ? (
          <ErrorState
            message={plansError}
            onRetry={retryData}
            title="Paketler yüklenemedi"
          />
        ) : plans.length === 0 ? (
          <EmptyState
            action={
              <button className="secondary" onClick={retryData} type="button">
                Paketleri yeniden yükle
              </button>
            }
            message="Paket listesi şu anda boş görünüyor. Biraz sonra yeniden deneyebilirsin."
            title="Henüz paket bulunmuyor"
          />
        ) : (
          <div className="plan-grid">
            {plans.map((plan) => {
              const isCurrentPlan =
                hasActiveSubscription &&
                plan.plan_type === subscription?.plan_type
              return (
                <article
                  className={`plan-card subscription-plan-card${isCurrentPlan ? ' current-plan' : ''}`}
                  key={plan.plan_type}
                >
                  {isCurrentPlan && (
                    <span className="current-plan-label">Aktif paketin</span>
                  )}
                  <div>
                    <h3>{plan.name}</h3>
                    <p className="plan-price">
                      <strong>{plan.monthly_price.toFixed(2)} TL</strong>
                      <span> / ay</span>
                    </p>
                  </div>
                  <ul className="plan-features">
                    <li>
                      {plan.coffee_credits === null
                        ? 'Sınırsız kahve'
                        : `Ayda ${plan.coffee_credits} kahve`}
                    </li>
                    <li>{plan.guest_credits} misafir hakkı</li>
                    {plan.priority_order && <li>Öncelikli sipariş</li>}
                    <li>{plan.eligible_shops}</li>
                  </ul>
                  <button
                    disabled={busy || subscriptionLoading || isCurrentPlan}
                    onClick={() => openPurchaseModal(plan)}
                    type="button"
                  >
                    {isCurrentPlan ? 'Aktif paket' : 'Satın Al'}
                  </button>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {selectedPlan && (
        <div className="modal-backdrop">
          <section
            aria-labelledby="purchase-modal-title"
            aria-modal="true"
            className="payment-modal"
            role="dialog"
          >
            <button
              aria-label="Pencereyi kapat"
              className="modal-close"
              disabled={busy}
              onClick={() => {
                setSelectedPlan(null)
              }}
              type="button"
            >
              ×
            </button>
            <p className="shop-explorer-eyebrow">Güvenli ödeme simülasyonu</p>
            <h2 id="purchase-modal-title">{selectedPlan.name} paketi</h2>
            <p className="muted">
              {selectedPlan.monthly_price.toFixed(2)} TL · 30 gün
            </p>
            <form className="form-grid" onSubmit={purchaseSelectedPlan}>
              <div className="form-field">
                <label htmlFor="subscription-card-number">Kart numarası</label>
                <input
                  autoComplete="cc-number"
                  autoFocus
                  id="subscription-card-number"
                  inputMode="numeric"
                  onChange={(event) => setCardNumber(event.target.value)}
                  required
                  value={cardNumber}
                />
                <small className="field-hint">Test kartı, değiştirmeyin.</small>
              </div>
              <button disabled={busy} type="submit">
                {busy ? 'Ödeme gönderiliyor…' : 'Ödemeyi Onayla'}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
