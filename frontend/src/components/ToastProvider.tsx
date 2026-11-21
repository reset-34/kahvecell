import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ToastContext, type ToastKind } from './toastContext'

interface ToastMessage {
  id: number
  kind: ToastKind
  message: string
}

const TOAST_DURATION_MS = 5000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const nextId = useRef(0)
  const timers = useRef(new Map<number, number>())

  const dismissToast = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = ++nextId.current
    setToasts((current) => [...current.slice(-2), { id, kind, message }])
    timers.current.set(
      id,
      window.setTimeout(() => {
        timers.current.delete(id)
        setToasts((current) => current.filter((toast) => toast.id !== id))
      }, TOAST_DURATION_MS),
    )
  }, [])

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer))
      timers.current.clear()
    },
    [],
  )

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div aria-label="Bildirimler" className="toast-viewport">
        {toasts.map((toast) => (
          <div
            className={`toast toast-${toast.kind}`}
            key={toast.id}
            role={toast.kind === 'error' ? 'alert' : 'status'}
          >
            <span aria-hidden="true" className="toast-icon">
              {toast.kind === 'success' ? '✓' : toast.kind === 'error' ? '!' : 'i'}
            </span>
            <p>{toast.message}</p>
            <button
              aria-label="Bildirimi kapat"
              className="toast-close"
              onClick={() => dismissToast(toast.id)}
              type="button"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
