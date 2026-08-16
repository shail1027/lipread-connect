import { useEffect, useRef, useState } from 'react'
import {
  Camera,
  CameraOff,
  CircleStop,
  Code2,
  LogIn,
  LogOut,
  Mic2,
  RefreshCw,
  Server,
  ShieldCheck,
  UserRound,
  Volume2,
} from 'lucide-react'
import './App.css'
import {
  clearSession,
  getCurrentUser,
  loadSession,
  logout,
  type User,
} from './api/auth'
import { getLiveness, getReadiness } from './api/health'
import { AuthDialog } from './components/AuthDialog'
import { RECOGNITION_MIN_FRAMES } from './recognition/protocol'
import {
  RecognitionSession,
  type RecognitionResult,
} from './recognition/session'

type CameraState = 'idle' | 'loading' | 'active' | 'error'
type RecognitionState =
  | 'idle'
  | 'connecting'
  | 'recording'
  | 'finishing'
  | 'complete'
  | 'error'
type ServerState = 'checking' | 'ready' | 'degraded' | 'offline'

const guideItems = [
  ['얼굴을 화면 중앙에 맞춰 주세요', '입술이 가이드 영역 안에 오면 인식률이 높아져요.'],
  ['밝은 곳에서 정면을 바라봐 주세요', '역광이나 어두운 환경은 피하는 것이 좋아요.'],
  ['평소처럼 자연스럽게 말해 주세요', '소리는 녹음하지 않고 입 모양만 분석해요.'],
]

const recognitionStatusLabels: Record<RecognitionState, string> = {
  idle: '연결 대기',
  connecting: '서버 연결 중',
  recording: '인식 중',
  finishing: '결과 처리 중',
  complete: '인식 완료',
  error: '연결 오류',
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recognitionSessionRef = useRef<RecognitionSession | null>(null)
  const recognitionTerminalRef = useRef(false)
  const recognitionErrorRef = useRef(false)
  const resultRef = useRef<RecognitionResult | null>(null)
  const [cameraState, setCameraState] = useState<CameraState>('idle')
  const [cameraError, setCameraError] = useState('')
  const [recognitionState, setRecognitionState] = useState<RecognitionState>('idle')
  const [recognitionError, setRecognitionError] = useState('')
  const [frameCount, setFrameCount] = useState(0)
  const [stopQueued, setStopQueued] = useState(false)
  const [result, setResult] = useState<RecognitionResult | null>(null)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authDialogOpen, setAuthDialogOpen] = useState(false)
  const [serverState, setServerState] = useState<ServerState>('checking')
  const [serverStateDetail, setServerStateDetail] = useState('서버 상태 확인 중')

  const disposeRecognitionSession = () => {
    recognitionSessionRef.current?.dispose()
    recognitionSessionRef.current = null
  }

  const stopCamera = () => {
    disposeRecognitionSession()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraState('idle')
    setRecognitionState('idle')
    setRecognitionError('')
    setFrameCount(0)
    setStopQueued(false)
  }

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('이 브라우저에서는 카메라를 사용할 수 없어요.')
      setCameraState('error')
      return
    }

    setCameraState('loading')
    setCameraError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraState('active')
    } catch (error) {
      const denied = error instanceof DOMException && error.name === 'NotAllowedError'
      setCameraError(
        denied
          ? '카메라 권한이 차단되었어요. 브라우저 설정에서 권한을 허용해 주세요.'
          : '카메라를 불러오지 못했어요. 다른 앱에서 사용 중인지 확인해 주세요.',
      )
      setCameraState('error')
    }
  }

  const requestCameraStart = () => {
    if (authLoading) return
    if (!currentUser) {
      setAuthDialogOpen(true)
      return
    }
    void startCamera()
  }

  const startRecognition = () => {
    const video = videoRef.current
    if (!video || cameraState !== 'active') return

    disposeRecognitionSession()
    recognitionTerminalRef.current = false
    recognitionErrorRef.current = false
    resultRef.current = null
    setRecognitionError('')
    setFrameCount(0)
    setStopQueued(false)
    setResult(null)

    try {
      const session = new RecognitionSession(video, {
        onConnecting: () => setRecognitionState('connecting'),
        onReady: () => setRecognitionState('recording'),
        onFrame: setFrameCount,
        onFinishing: () => {
          setStopQueued(false)
          setRecognitionState('finishing')
        },
        onResult: (nextResult) => {
          recognitionTerminalRef.current = true
          resultRef.current = nextResult
          setResult(nextResult)
          setRecognitionState('complete')
        },
        onServerError: (_code, message) => {
          recognitionTerminalRef.current = true
          recognitionErrorRef.current = true
          setRecognitionError(message)
          setRecognitionState('error')
        },
        onClientError: (message) => {
          recognitionErrorRef.current = true
          setRecognitionError(message)
          setRecognitionState('error')
        },
        onStopped: () => {
          recognitionTerminalRef.current = true
          if (!recognitionErrorRef.current) {
            setRecognitionState(resultRef.current ? 'complete' : 'idle')
          }
        },
        onClosed: (code, wasClean) => {
          recognitionSessionRef.current = null
          if (!recognitionTerminalRef.current && (!wasClean || code !== 1000)) {
            recognitionErrorRef.current = true
            setRecognitionError('서버 연결이 예기치 않게 종료됐어요. 다시 시도해 주세요.')
            setRecognitionState('error')
          }
        },
      })
      recognitionSessionRef.current = session
      session.start()
    } catch (error) {
      recognitionErrorRef.current = true
      setRecognitionError(
        error instanceof Error ? error.message : '립리딩 연결을 시작하지 못했어요.',
      )
      setRecognitionState('error')
    }
  }

  const stopRecognition = () => {
    if (recognitionState !== 'recording' || stopQueued) return
    setStopQueued(true)
    recognitionSessionRef.current?.requestStop()
  }

  const speakResult = () => {
    if (!result || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(result.text)
    utterance.lang = 'ko-KR'
    window.speechSynthesis.speak(utterance)
  }

  const handleAuthenticated = (user: User, token: string) => {
    setCurrentUser(user)
    setSessionToken(token)
  }

  const handleLogout = async () => {
    stopCamera()
    try {
      if (sessionToken) await logout(sessionToken)
    } catch {
      // 서버가 오프라인이어도 브라우저의 세션은 종료한다.
    } finally {
      clearSession()
      setCurrentUser(null)
      setSessionToken(null)
    }
  }

  useEffect(() => {
    let active = true

    const restoreSession = async () => {
      const storedSession = loadSession()
      if (!storedSession) {
        if (active) setAuthLoading(false)
        return
      }

      try {
        const user = await getCurrentUser(storedSession.token)
        if (active) {
          setCurrentUser(user)
          setSessionToken(storedSession.token)
        }
      } catch {
        clearSession()
      } finally {
        if (active) setAuthLoading(false)
      }
    }

    void restoreSession()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    const refreshServerState = async () => {
      try {
        await getLiveness()
        const readiness = await getReadiness()
        if (!active) return

        if (readiness.status === 'ready') {
          setServerState('ready')
          setServerStateDetail('데이터베이스와 인식 모델 준비 완료')
        } else {
          setServerState('degraded')
          setServerStateDetail(
            `데이터베이스 ${readiness.database === 'ready' ? '준비됨' : '대기'} · 모델 ${readiness.inference === 'ready' ? '준비됨' : '대기'}`,
          )
        }
      } catch {
        if (active) {
          setServerState('offline')
          setServerStateDetail('백엔드 서버에 연결할 수 없음')
        }
      }
    }

    void refreshServerState()
    const timer = window.setInterval(refreshServerState, 30_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  useEffect(
    () => () => {
      recognitionSessionRef.current?.dispose()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      window.speechSynthesis?.cancel()
    },
    [],
  )

  const cameraActive = cameraState === 'active'
  const recognitionRunning = recognitionState === 'recording'
  const recognitionBusy =
    recognitionState === 'connecting' || recognitionState === 'finishing'
  const recognitionButtonLabel = recognitionRunning
    ? stopQueued
      ? '종료 준비 중...'
      : '인식 멈추기'
    : recognitionState === 'complete' || recognitionState === 'error'
      ? '다시 인식하기'
      : recognitionState === 'connecting'
        ? '서버 연결 중...'
        : recognitionState === 'finishing'
          ? '결과 처리 중...'
          : '인식 시작하기'

  const resultMessage = result
    ? result.text
    : recognitionState === 'recording'
      ? stopQueued && frameCount < RECOGNITION_MIN_FRAMES
        ? '인식에 필요한 영상을 조금 더 모으고 있어요...'
        : '입 모양을 살펴보고 있어요...'
      : recognitionState === 'connecting'
        ? '립리딩 서버에 연결하고 있어요...'
        : recognitionState === 'finishing'
          ? '촬영한 영상에서 문장을 찾고 있어요...'
          : recognitionState === 'error'
            ? recognitionError
            : '인식을 시작하면 이곳에 문장이 표시돼요.'

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="서비스 홈">
          <span className="brand-mark"><Mic2 size={20} strokeWidth={2.4} /></span>
        </a>
        <div className="topbar-actions">
          <span className={`server-state ${serverState}`} title={serverStateDetail}>
            <Server size={14} />
            {serverState === 'ready'
              ? '서버 준비됨'
              : serverState === 'degraded'
                ? '서버 점검 필요'
                : serverState === 'offline'
                  ? '서버 연결 안 됨'
                  : '서버 확인 중'}
          </span>
          <nav>
            <a href="#how-to">이용 안내</a>
            <a href="https://github.com/HumanRhoid/hanium-lipreading" target="_blank" rel="noreferrer"><Code2 size={17} /> 프로젝트</a>
          </nav>
          {currentUser ? (
            <div className="account-menu">
              <span className="account-name" title={`${currentUser.hospital}${currentUser.ward ? ` · ${currentUser.ward}` : ''}`}>
                <UserRound size={15} /> {currentUser.name}
              </span>
              <button onClick={handleLogout} aria-label="로그아웃"><LogOut size={16} /></button>
            </div>
          ) : (
            <button
              className="login-button"
              onClick={() => setAuthDialogOpen(true)}
              disabled={authLoading}
            >
              <LogIn size={16} /> {authLoading ? '확인 중' : '로그인'}
            </button>
          )}
        </div>
      </header>

      <main id="top">
        <section className="workspace" aria-label="립리딩 체험">
          <div className="camera-card">
            <div className="card-heading">
              <div><span className={`status-dot ${cameraActive ? 'on' : ''}`} /> 카메라</div>
              <span className="privacy"><ShieldCheck size={15} /> 영상은 저장되지 않아요</span>
            </div>

            <div className={`video-stage ${cameraActive ? 'is-live' : ''}`}>
              <video ref={videoRef} playsInline muted aria-label="미러링된 카메라 화면" />
              {cameraActive && <div className="face-guide"><span>얼굴을 이 안에 맞춰 주세요</span></div>}
              {!cameraActive && (
                <div className="camera-placeholder">
                  <div className="camera-icon"><Camera size={34} /></div>
                  <strong>{cameraState === 'loading' ? '카메라를 불러오는 중...' : cameraState === 'error' ? '카메라를 확인해 주세요' : '카메라를 켜 주세요'}</strong>
                  <p>{cameraState === 'error' ? cameraError : '입 모양 인식을 위해 카메라 접근이 필요해요.'}</p>
                  {cameraState === 'error' && <button className="text-button" onClick={startCamera}><RefreshCw size={15} /> 다시 시도</button>}
                </div>
              )}
            </div>

            <div className="camera-actions">
              {!cameraActive ? (
                <button className="primary-button" onClick={requestCameraStart} disabled={cameraState === 'loading' || authLoading}><Camera size={19} /> {cameraState === 'loading' ? '연결 중...' : currentUser ? '카메라 시작하기' : '로그인하고 시작하기'}</button>
              ) : (
                <>
                  <button
                    className={`primary-button ${recognitionRunning ? 'reading' : ''}`}
                    onClick={recognitionRunning ? stopRecognition : startRecognition}
                    disabled={recognitionBusy || stopQueued}
                  >
                    {recognitionRunning ? <CircleStop size={19} /> : <Mic2 size={19} />}
                    {recognitionButtonLabel}
                  </button>
                  <button className="icon-button" onClick={stopCamera} aria-label="카메라 끄기"><CameraOff size={19} /></button>
                </>
              )}
            </div>
          </div>

          <aside className="result-card" aria-live="polite">
            <div className="card-heading">
              <div><span className="result-icon"><Mic2 size={15} /></span> 인식 결과</div>
              <span className={`model-status ${recognitionState}`}>{recognitionStatusLabels[recognitionState]}</span>
            </div>
            <div className="result-body">
              <div className={`wave ${recognitionRunning ? 'moving' : ''}`} aria-hidden="true">{[12, 22, 16, 29, 20, 34, 18, 26, 14, 22, 11].map((height, index) => <i key={index} style={{ height }} />)}</div>
              <p className={`result-text ${recognitionState === 'error' ? 'error' : ''}`}>{resultMessage}</p>
              <p className="result-hint">
                {recognitionRunning
                  ? `${frameCount}프레임 전송 · ${Math.max(0, RECOGNITION_MIN_FRAMES - frameCount)}프레임 후 종료 가능`
                  : result?.confidence != null
                    ? `인식 신뢰도 ${Math.round(result.confidence * 100)}%`
                    : '촬영이 끝나면 한 번의 최종 결과를 제공해요.'}
              </p>
            </div>
            <button className="speak-button" disabled={!result} onClick={speakResult}><Volume2 size={18} /> 문장 읽어주기</button>
          </aside>
        </section>

        <section className="how-to" id="how-to">
          <div className="section-title"><span>더 정확하게 인식하려면</span><h2>이렇게 사용해 주세요</h2></div>
          <div className="guide-grid">
            {guideItems.map(([title, description], index) => (
              <article key={title}><span className="guide-number">0{index + 1}</span><div><h3>{title}</h3><p>{description}</p></div></article>
            ))}
          </div>
        </section>
      </main>

      <footer><span>한국어 립리딩 프로젝트</span><span>HumanRhoid × 한이음 드림업</span></footer>
      <AuthDialog
        open={authDialogOpen}
        onAuthenticated={handleAuthenticated}
        onClose={() => setAuthDialogOpen(false)}
      />
    </div>
  )
}

export default App
