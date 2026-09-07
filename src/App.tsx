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
  ScanFace,
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
  type UserRole,
} from './api/auth'
import { getLiveness, getReadiness } from './api/health'
import {
  uploadRecognitionVideo,
  waitForInferenceResult,
  type InferenceResult,
} from './api/recognition'
import { AuthDialog } from './components/AuthDialog'
import { MedicalDashboard } from './components/MedicalDashboard'
import {
  MAX_RECORDING_MS,
  MIN_RECORDING_MS,
  VideoRecordingSession,
} from './recognition/recording'

type CameraState = 'idle' | 'loading' | 'active' | 'error'
type RecognitionState =
  | 'idle'
  | 'recording'
  | 'uploading'
  | 'queued'
  | 'processing'
  | 'complete'
  | 'error'
type ServerState = 'checking' | 'ready' | 'degraded' | 'offline'

const guideItems = [
  ['얼굴을 화면 중앙에 맞춰 주세요', '입술이 가이드 영역 안에 오면 인식률이 높아져요.'],
  ['밝은 곳에서 정면을 바라봐 주세요', '역광이나 어두운 환경은 피하는 것이 좋아요.'],
  ['3초 이상 자연스럽게 말해 주세요', '최대 10초가 되면 촬영이 자동으로 끝나요.'],
]

const recognitionStatusLabels: Record<RecognitionState, string> = {
  idle: '촬영 대기',
  recording: '촬영 중',
  uploading: '업로드 중',
  queued: '처리 대기',
  processing: '분석 중',
  complete: '인식 완료',
  error: '처리 오류',
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<VideoRecordingSession | null>(null)
  const progressTimerRef = useRef<number | null>(null)
  const autoStopTimerRef = useRef<number | null>(null)
  const minimumStopTimerRef = useRef<number | null>(null)
  const positionGuideTimerRef = useRef<number | null>(null)
  const pollAbortRef = useRef<AbortController | null>(null)
  const [cameraState, setCameraState] = useState<CameraState>('idle')
  const [cameraError, setCameraError] = useState('')
  const [recognitionState, setRecognitionState] = useState<RecognitionState>('idle')
  const [recognitionError, setRecognitionError] = useState('')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [stopQueued, setStopQueued] = useState(false)
  const [result, setResult] = useState<InferenceResult | null>(null)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [currentRole, setCurrentRole] = useState<UserRole>('PATIENT')
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authDialogOpen, setAuthDialogOpen] = useState(false)
  const [serverState, setServerState] = useState<ServerState>('checking')
  const [serverStateDetail, setServerStateDetail] = useState('서버 상태 확인 중')
  const [positionGuideVisible, setPositionGuideVisible] = useState(false)

  const showPositionGuide = () => {
    if (positionGuideTimerRef.current !== null) {
      window.clearTimeout(positionGuideTimerRef.current)
    }
    setPositionGuideVisible(true)
    positionGuideTimerRef.current = window.setTimeout(() => {
      setPositionGuideVisible(false)
      positionGuideTimerRef.current = null
    }, 3200)
  }

  const clearRecordingTimers = () => {
    if (progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current)
      progressTimerRef.current = null
    }
    if (autoStopTimerRef.current !== null) {
      window.clearTimeout(autoStopTimerRef.current)
      autoStopTimerRef.current = null
    }
    if (minimumStopTimerRef.current !== null) {
      window.clearTimeout(minimumStopTimerRef.current)
      minimumStopTimerRef.current = null
    }
  }

  const disposeRecognition = () => {
    clearRecordingTimers()
    recorderRef.current?.cancel()
    recorderRef.current = null
    pollAbortRef.current?.abort()
    pollAbortRef.current = null
  }

  const stopCamera = () => {
    disposeRecognition()
    if (positionGuideTimerRef.current !== null) {
      window.clearTimeout(positionGuideTimerRef.current)
      positionGuideTimerRef.current = null
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraState('idle')
    setRecognitionState('idle')
    setRecognitionError('')
    setElapsedMs(0)
    setStopQueued(false)
    setPositionGuideVisible(false)
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
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 25, max: 25 },
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraState('active')
      showPositionGuide()
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
    showPositionGuide()
    void startCamera()
  }

  async function finishRecognition() {
    const recorder = recorderRef.current
    const token = sessionToken
    if (!recorder || !token) return

    recorderRef.current = null
    clearRecordingTimers()
    setElapsedMs(Math.min(recorder.elapsedMs, MAX_RECORDING_MS))
    setStopQueued(false)
    showPositionGuide()
    setRecognitionState('uploading')
    const abortController = new AbortController()
    pollAbortRef.current = abortController

    try {
      const video = await recorder.stop()
      if (abortController.signal.aborted) {
        throw new DOMException('요청이 취소됐습니다.', 'AbortError')
      }
      const upload = await uploadRecognitionVideo(video, token, abortController.signal)
      setRecognitionState('queued')

      const inferenceResult = await waitForInferenceResult(upload.job_id, token, {
        signal: abortController.signal,
        onStatus: (status) => {
          if (status === 'PROCESSING') setRecognitionState('processing')
        },
      })
      setResult(inferenceResult)
      setRecognitionState('complete')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setRecognitionError(
        error instanceof Error ? error.message : '영상을 처리하지 못했어요.',
      )
      setRecognitionState('error')
    } finally {
      if (pollAbortRef.current === abortController) pollAbortRef.current = null
    }
  }

  const startRecognition = () => {
    const stream = streamRef.current
    if (!stream || cameraState !== 'active' || !sessionToken) return

    disposeRecognition()
    setRecognitionError('')
    setResult(null)
    setElapsedMs(0)
    setStopQueued(false)

    try {
      const recorder = new VideoRecordingSession(stream)
      recorderRef.current = recorder
      recorder.start()
      setRecognitionState('recording')

      progressTimerRef.current = window.setInterval(() => {
        setElapsedMs(recorder.elapsedMs)
      }, 100)
      autoStopTimerRef.current = window.setTimeout(() => {
        void finishRecognition()
      }, MAX_RECORDING_MS)
    } catch (error) {
      setRecognitionError(
        error instanceof Error ? error.message : '영상 녹화를 시작하지 못했어요.',
      )
      setRecognitionState('error')
    }
  }

  const requestRecognitionStop = () => {
    const recorder = recorderRef.current
    if (!recorder || stopQueued) return

    const remainingMs = MIN_RECORDING_MS - recorder.elapsedMs
    if (remainingMs > 0) {
      setStopQueued(true)
      minimumStopTimerRef.current = window.setTimeout(() => {
        void finishRecognition()
      }, remainingMs)
      return
    }

    void finishRecognition()
  }

  const speakResult = () => {
    if (!result || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(result.text)
    utterance.lang = 'ko-KR'
    window.speechSynthesis.speak(utterance)
  }

  const handleAuthenticated = (user: User, token: string, role: UserRole) => {
    setCurrentUser(user)
    setSessionToken(token)
    setCurrentRole(role)
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
      setCurrentRole('PATIENT')
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
          setCurrentRole(storedSession.role)
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
      clearRecordingTimers()
      recorderRef.current?.cancel()
      pollAbortRef.current?.abort()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      window.speechSynthesis?.cancel()
      if (positionGuideTimerRef.current !== null) {
        window.clearTimeout(positionGuideTimerRef.current)
      }
    },
    [],
  )

  const cameraActive = cameraState === 'active'
  const recognitionRunning = recognitionState === 'recording'
  const recognitionBusy = ['uploading', 'queued', 'processing'].includes(recognitionState)
  const recognitionButtonLabel = recognitionRunning
    ? stopQueued
      ? '촬영 마무리 중...'
      : '촬영 끝내기'
    : recognitionState === 'complete' || recognitionState === 'error'
      ? '다시 촬영하기'
      : recognitionState === 'uploading'
        ? '영상 업로드 중...'
        : recognitionState === 'queued'
          ? '처리 대기 중...'
          : recognitionState === 'processing'
            ? '모델 분석 중...'
            : '인식 시작하기'

  const resultMessage = result
    ? result.text
    : recognitionState === 'recording'
      ? stopQueued
        ? '인식에 필요한 영상을 조금 더 촬영하고 있어요...'
        : '입 모양을 촬영하고 있어요...'
      : recognitionState === 'uploading'
        ? '촬영한 영상을 안전하게 전송하고 있어요...'
        : recognitionState === 'queued'
          ? '인식 순서를 기다리고 있어요...'
          : recognitionState === 'processing'
            ? '영상에서 입 모양을 분석하고 있어요...'
            : recognitionState === 'error'
              ? recognitionError
              : '인식을 시작하면 이곳에 문장이 표시돼요.'

  if (currentUser && sessionToken && currentRole === 'STAFF') {
    return (
      <MedicalDashboard
        user={currentUser}
        sessionToken={sessionToken}
        onLogout={() => void handleLogout()}
      />
    )
  }

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
              <span className="account-name" title={currentUser.username}>
                <UserRound size={15} /> {currentUser.display_name}
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
              <span className="privacy"><ShieldCheck size={15} /> 영상은 추론을 위해 임시 업로드돼요</span>
            </div>

            <div className={`video-stage ${cameraActive ? 'is-live' : ''}`}>
              <video ref={videoRef} playsInline muted aria-label="미러링된 카메라 화면" />
              {cameraActive && <div className="face-guide"><span>얼굴을 이 안에 맞춰 주세요</span></div>}
              {positionGuideVisible && (
                <div className="position-guide" role="status">
                  <span><ScanFace size={24} /></span>
                  <div><strong>얼굴을 조금 더 가까이 해주세요</strong><small>입술이 가이드 영역 안에서 충분히 크게 보이도록 맞춰주세요.</small></div>
                  <button onClick={() => setPositionGuideVisible(false)}>확인</button>
                </div>
              )}
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
                    onClick={recognitionRunning ? requestRecognitionStop : startRecognition}
                    disabled={recognitionBusy || stopQueued}
                  >
                    {recognitionRunning ? <CircleStop size={19} /> : <Mic2 size={19} />}
                    {recognitionButtonLabel}
                  </button>
                  <button className="icon-button" onClick={stopCamera} disabled={recognitionRunning || recognitionBusy} aria-label="카메라 끄기"><CameraOff size={19} /></button>
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
              <div className={`wave ${recognitionRunning || recognitionBusy ? 'moving' : ''}`} aria-hidden="true">{[12, 22, 16, 29, 20, 34, 18, 26, 14, 22, 11].map((height, index) => <i key={index} style={{ height }} />)}</div>
              <p className={`result-text ${recognitionState === 'error' ? 'error' : ''}`}>{resultMessage}</p>
              <p className="result-hint">
                {recognitionRunning
                  ? `${Math.min(elapsedMs / 1000, MAX_RECORDING_MS / 1000).toFixed(1)}초 촬영 · 최대 ${MAX_RECORDING_MS / 1000}초`
                  : result?.confidence != null
                    ? `인식 신뢰도 ${Math.round(result.confidence * 100)}%`
                    : '촬영이 끝나면 서버에서 최종 결과를 제공해요.'}
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
