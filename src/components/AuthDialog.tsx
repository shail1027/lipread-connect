import { useEffect, useState, type FormEvent } from 'react'
import { HeartPulse, LogIn, UserPlus, UserRound, X } from 'lucide-react'
import {
  clearSession,
  getCurrentUser,
  login,
  saveSession,
  signup,
  type User,
  type UserRole,
} from '../api/auth'

type AuthMode = 'login' | 'signup'

type AuthDialogProps = {
  open: boolean
  onAuthenticated: (user: User, sessionToken: string, role: UserRole) => void
  onClose: () => void
}

export function AuthDialog({ open, onAuthenticated, onClose }: AuthDialogProps) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [role, setRole] = useState<UserRole>('PATIENT')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) setError('')
  }, [open])

  if (!open) return null

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode)
    setError('')
  }

  const changeRole = (nextRole: UserRole) => {
    setRole(nextRole)
    setMode('login')
    setError('')
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      if (mode === 'signup') {
        await signup({
          username,
          password,
          display_name: displayName,
        })
      }

      const session = await login({ username, password })
      saveSession(session, role)
      const user = await getCurrentUser(session.session_token)
      onAuthenticated(user, session.session_token, role)
      setPassword('')
      setDisplayName('')
      onClose()
    } catch (requestError) {
      clearSession()
      setError(
        requestError instanceof Error
          ? requestError.message
          : '로그인 요청을 처리하지 못했어요.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="auth-close" onClick={onClose} aria-label="닫기">
          <X size={18} />
        </button>

        <div className="auth-heading">
          <span className="auth-symbol">
            {role === 'STAFF' ? <HeartPulse size={20} /> : <UserRound size={20} />}
          </span>
          <div>
            <span>립리딩 사용자 계정</span>
            <h2 id="auth-title">
              {mode === 'signup' ? '회원가입' : role === 'STAFF' ? '의료진 로그인' : '환자 로그인'}
            </h2>
          </div>
        </div>

        <div className="role-tabs" role="tablist" aria-label="사용자 역할">
          <button
            className={role === 'PATIENT' ? 'active' : ''}
            onClick={() => changeRole('PATIENT')}
            role="tab"
            aria-selected={role === 'PATIENT'}
          >
            <UserRound size={15} /> 환자
          </button>
          <button
            className={role === 'STAFF' ? 'active' : ''}
            onClick={() => changeRole('STAFF')}
            role="tab"
            aria-selected={role === 'STAFF'}
          >
            <HeartPulse size={15} /> 의료진
          </button>
        </div>

        {role === 'PATIENT' && <div className="auth-tabs" role="tablist" aria-label="계정 메뉴">
          <button
            className={mode === 'login' ? 'active' : ''}
            onClick={() => changeMode('login')}
            role="tab"
            aria-selected={mode === 'login'}
          >
            로그인
          </button>
          <button
            className={mode === 'signup' ? 'active' : ''}
            onClick={() => changeMode('signup')}
            role="tab"
            aria-selected={mode === 'signup'}
          >
            회원가입
          </button>
        </div>}

        {role === 'STAFF' && (
          <p className="staff-login-hint">
            병원에서 발급한 의료진 계정으로 로그인해 주세요.
          </p>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <label>
              표시 이름
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="name"
                minLength={1}
                maxLength={50}
                required
              />
            </label>
          )}

          <label>
            아이디
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              minLength={mode === 'signup' ? 4 : undefined}
              maxLength={50}
              required
            />
          </label>
          <label>
            비밀번호
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={mode === 'signup' ? 8 : undefined}
              maxLength={128}
              required
            />
          </label>

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button className="auth-submit" type="submit" disabled={submitting}>
            {mode === 'login' ? <LogIn size={18} /> : <UserPlus size={18} />}
            {submitting
              ? '처리 중...'
              : mode === 'login'
                ? role === 'STAFF' ? '의료진으로 로그인' : '로그인하기'
                : '가입하고 로그인하기'}
          </button>
        </form>
      </section>
    </div>
  )
}
