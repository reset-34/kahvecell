import { useContext } from 'react'
import { ToastContext } from './toastContext'

export function useToast() {
  const showToast = useContext(ToastContext)
  if (!showToast) {
    throw new Error('useToast, ToastProvider içinde kullanılmalıdır.')
  }
  return showToast
}
