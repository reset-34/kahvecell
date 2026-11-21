import { Link } from 'react-router-dom'
import { EmptyState } from '../components/PageStates'

export function NotFoundPage() {
  return (
    <EmptyState
      action={<Link className="button" to="/">Ana sayfaya dön</Link>}
      message="Adres yanlış olabilir. Ana sayfadan dükkânları ve siparişlerini bulabilirsin."
      title="Bu sayfa bulunamadı"
    />
  )
}
