import { Link, Outlet } from 'react-router-dom'

export function AuthLayout() {
  return (
    <main className="auth-page">
      <section aria-label="KahveCell hesabı" className="auth-card">
        <Link aria-label="KahveCell ana sayfa" className="auth-brand" to="/">
          <span aria-hidden="true" className="auth-brand-mark">K</span>
          <span>KahveCell</span>
        </Link>
        <Outlet />
      </section>
    </main>
  )
}
