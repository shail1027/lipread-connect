import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, CircleStop, Code2, Mic2, RefreshCw, ShieldCheck, Volume2 } from 'lucide-react'
import './App.css'

type CameraState = 'idle' | 'loading' | 'active' | 'error'

const guideItems = [
  ['얼굴을 화면 중앙에 맞춰 주세요', '입술이 가이드 영역 안에 오면 인식률이 높아져요.'],
  ['밝은 곳에서 정면을 바라봐 주세요', '역광이나 어두운 환경은 피하는 것이 좋아요.'],
  ['평소처럼 자연스럽게 말해 주세요', '소리는 녹음하지 않고 입 모양만 분석할 예정이에요.'],
]

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraState, setCameraState] = useState<CameraState>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [isReading, setIsReading] = useState(false)

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraState('idle')
    setIsReading(false)
  }

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage('이 브라우저에서는 카메라를 사용할 수 없어요.')
      setCameraState('error')
      return
    }

    setCameraState('loading')
    setErrorMessage('')
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
      setErrorMessage(denied ? '카메라 권한이 차단되었어요. 브라우저 설정에서 권한을 허용해 주세요.' : '카메라를 불러오지 못했어요. 다른 앱에서 사용 중인지 확인해 주세요.')
      setCameraState('error')
    }
  }

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), [])

  const cameraActive = cameraState === 'active'

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="서비스 홈">
          <span className="brand-mark"><Mic2 size={20} strokeWidth={2.4} /></span>
        </a>
        <nav>
          <a href="#how-to">이용 안내</a>
          <a href="https://github.com/HumanRhoid/hanium-lipreading" target="_blank" rel="noreferrer"><Code2 size={17} /> 프로젝트</a>
        </nav>
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
                  <p>{cameraState === 'error' ? errorMessage : '입 모양 인식을 위해 카메라 접근이 필요해요.'}</p>
                  {cameraState === 'error' && <button className="text-button" onClick={startCamera}><RefreshCw size={15} /> 다시 시도</button>}
                </div>
              )}
            </div>

            <div className="camera-actions">
              {!cameraActive ? (
                <button className="primary-button" onClick={startCamera} disabled={cameraState === 'loading'}><Camera size={19} /> {cameraState === 'loading' ? '연결 중...' : '카메라 시작하기'}</button>
              ) : (
                <>
                  <button className={`primary-button ${isReading ? 'reading' : ''}`} onClick={() => setIsReading((value) => !value)}>
                    {isReading ? <CircleStop size={19} /> : <Mic2 size={19} />}{isReading ? '인식 멈추기' : '인식 시작하기'}
                  </button>
                  <button className="icon-button" onClick={stopCamera} aria-label="카메라 끄기"><CameraOff size={19} /></button>
                </>
              )}
            </div>
          </div>

          <aside className="result-card">
            <div className="card-heading"><div><span className="result-icon"><Mic2 size={15} /></span> 인식 결과</div><span className="model-status">연결 대기</span></div>
            <div className="result-body">
              <div className={`wave ${isReading ? 'moving' : ''}`} aria-hidden="true">{[12, 22, 16, 29, 20, 34, 18, 26, 14, 22, 11].map((height, index) => <i key={index} style={{ height }} />)}</div>
              <p className="result-text">{isReading ? '입 모양을 살펴보고 있어요...' : '인식을 시작하면 이곳에 문장이 표시돼요.'}</p>
              <p className="result-hint">모델과 백엔드 연결 후<br />실시간 인식 결과가 제공됩니다.</p>
            </div>
            <button className="speak-button" disabled><Volume2 size={18} /> 문장 읽어주기</button>
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
    </div>
  )
}

export default App
