import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import axios from 'axios'
import { authApi, getErrorMessage } from '../lib/api'
import { ErrorState, LoadingState } from './PageStates'

interface RequireShopOwnerProps {
  children: ReactNode
}

type AccessState = 'checking' | 'allowed' | 'unauthenticated' | 'forbidden' | 'error'

export function RequireShopOwner({ children }: RequireShopOwnerProps) {
  const [access, setAccess] = useState<AccessState>('checking')
  const [errorMessage, setErrorMessage] = useState('')
  const [requestVersion, setRequestVersion] = useState(0)

  useEffect(() => {
    let active = true
    authApi
      .me()
      .then((user) => {
        if (active) {
          setAccess(user.role === 'SHOP_OWNER' ? 'allowed' : 'forbidden')
        }
      })
      .catch((error: unknown) => {
        if (!active) return

        if (axios.isAxiosError(error) && error.response?.status === 401) {
          setAccess('unauthenticated')
          return
        }
        setErrorMessage(getErrorMessage(error))
        setAccess('error')
      })

    return () => {
      active = false
    }
  }, [requestVersion])

  function retryAccessCheck() {
    setErrorMessage('')
    setAccess('checking')
    setRequestVersion((version) => version + 1)
  }

  if (access === 'checking') {
    return <LoadingState message="Hesap bilgileri kontrol ediliyor…" />
  }
  if (access === 'unauthenticated') {
    return <Navigate to="/login" replace />
  }
  if (access === 'forbidden') {
    return <Navigate to="/" replace />
  }
  if (access === 'error') {
    return (
      <ErrorState
        message={errorMessage}
        onRetry={retryAccessCheck}
        title="Hesap doğrulanamadı"
      />
    )
  }
  return children
}
