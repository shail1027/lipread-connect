import { useEffect, useState, type FormEvent } from 'react'
import { Building2, LogIn, UserPlus, X } from 'lucide-react'
import {
  clearSession,
  getCurrentUser,
  login,
  saveSession,
  signup,
  type User,
} from '../api/auth'

type AuthMode = 'login' | 'signup'

type AuthDialogProps = {
  open: boolean
  onAuthenticated: (user: User, sessionToken: string) => void
  onClose: () => void
}

const emptySignupFields = {
  name: '',
  hospital: '',
  ward: '',
}

export function AuthDialog({ open, onAuthenticated, onClose }: AuthDialogProps) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [signupFields, setSignupFields] = useState(emptySignupFields)
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      if (mode === 'signup') {
        await signup({
          username,
          password,
          name: signupFields.name,
          hospital: signupFields.hospital,
          ward: signupFields.ward.trim() || null,
        })
      }

      const session = await login({ username, password })
      saveSession(session)
      const user = await getCurrentUser(session.session_token)
      onAuthenticated(user, session.session_token)
      setPassword('')
      setSignupFields(emptySignupFields)
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
          <span className="auth-symbol"><Building2 size={20} /></span>
          <div>
            <span>의료진 계정</span>
            <h2 id="auth-title">{mode === 'login' ? '로그인' : '회원가입'}</h2>
          </div>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="계정 메뉴">
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
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <>
              <label>
                이름
                <input
                  value={signupFields.name}
                  onChange={(event) =>
                    setSignupFields((fields) => ({ ...fields, name: event.target.value }))
                  }
                  autoComplete="name"
                  minLength={1}
                  maxLength={50}
                  required
                />
              </label>
              <label>
                병원
                <input
                  value={signupFields.hospital}
                  onChange={(event) =>
                    setSignupFields((fields) => ({ ...fields, hospital: event.target.value }))
                  }
                  autoComplete="organization"
                  minLength={1}
                  maxLength={100}
                  required
                />
              </label>
              <label>
                병동 <span>선택</span>
                <input
                  value={signupFields.ward}
                  onChange={(event) =>
                    setSignupFields((fields) => ({ ...fields, ward: event.target.value }))
                  }
                  maxLength={100}
                />
              </label>
            </>
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
                ? '로그인하기'
                : '가입하고 로그인하기'}
          </button>
        </form>
      </section>
    </div>
  )
}
