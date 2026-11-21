import { NavLink, Outlet } from 'react-router-dom'

const links = [
  { to: '/', label: 'Ana sayfa', end: true },
  { to: '/shops', label: 'Dükkânlar' },
  { to: '/subscription', label: 'Abonelik' },
  { to: '/orders/history', label: 'Siparişlerim' },
  { to: '/login', label: 'Giriş' },
  { to: '/register', label: 'Kayıt' },
]

export function AppLayout() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="nav-content">
          <NavLink className="brand" to="/">
            KahveCell
          </NavLink>
          <nav aria-label="Ana menü" className="main-nav">
            {links.map(({ to, label, end }) => (
              <NavLink
                className={({ isActive }) =>
                  `nav-link${isActive ? ' active' : ''}`
                }
                end={end}
                key={to}
                to={to}
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="page-content">
        <Outlet />
      </main>
      <footer className="site-footer">KahveCell • Geliştirme sürümü</footer>
    </div>
  )
}
