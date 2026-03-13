import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  getMe,
  login as apiLogin,
  register as apiRegister,
  setToken,
  type AuthUser,
  type RegisterBody,
} from '@/api/client'

type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  login: (username: string, password: string) => Promise<AuthUser>
  register: (body: RegisterBody) => Promise<AuthUser>
  logout: () => void
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const t = localStorage.getItem('jois_token')
    if (!t) {
      setUser(null)
      return
    }
    try {
      const u = await getMe()
      setUser(u)
    } catch {
      setToken(null)
      setUser(null)
    }
  }, [])

  useEffect(() => {
    void refresh().finally(() => setLoading(false))
  }, [refresh])

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiLogin(username, password)
    setToken(res.token)
    setUser(res.user)
    return res.user
  }, [])

  const register = useCallback(async (body: RegisterBody) => {
    const res = await apiRegister(body)
    setToken(res.token)
    setUser(res.user)
    return res.user
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
