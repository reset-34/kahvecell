import type { ReactNode } from 'react'

interface LoadingStateProps {
  message: string
}

export function LoadingState({ message }: LoadingStateProps) {
  return (
    <div aria-live="polite" className="page-state loading-state" role="status">
      <span aria-hidden="true" className="loading-spinner" />
      <span>{message}</span>
    </div>
  )
}

interface ErrorStateProps {
  message: string
  onRetry: () => void
  title?: string
}

export function ErrorState({
  message,
  onRetry,
  title = 'Bir şeyler ters gitti',
}: ErrorStateProps) {
  return (
    <section aria-live="assertive" className="page-state error-state" role="alert">
      <span aria-hidden="true" className="page-state-icon">!</span>
      <div>
        <h2>{title}</h2>
        <p>{message}</p>
        <button onClick={onRetry} type="button">
          Tekrar dene
        </button>
      </div>
    </section>
  )
}

interface EmptyStateProps {
  title: string
  message: string
  action?: ReactNode
}

export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <section className="page-state empty-state">
      <span aria-hidden="true" className="page-state-icon">☕</span>
      <div>
        <h2>{title}</h2>
        <p>{message}</p>
        {action}
      </div>
    </section>
  )
}
