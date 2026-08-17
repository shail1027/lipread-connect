import { createRecognitionCanvas, encodeRecognitionFrame } from './frame'
import {
  RECOGNITION_FRAME_INTERVAL_MS,
  RECOGNITION_MAX_BUFFERED_BYTES,
  RECOGNITION_MAX_FRAMES,
  RECOGNITION_MIN_FRAMES,
  getRecognitionWebSocketUrl,
  parseRecognitionEvent,
  type RecognitionErrorCode,
} from './protocol'

export type RecognitionResult = {
  text: string
  confidence: number | null
}

export type RecognitionSessionCallbacks = {
  onConnecting: () => void
  onReady: () => void
  onFrame: (frameCount: number) => void
  onFinishing: () => void
  onResult: (result: RecognitionResult) => void
  onServerError: (code: RecognitionErrorCode, message: string) => void
  onClientError: (message: string) => void
  onStopped: () => void
  onClosed: (code: number, wasClean: boolean) => void
}

export class RecognitionSession {
  private readonly canvas = createRecognitionCanvas()
  private readonly callbacks: RecognitionSessionCallbacks
  private readonly endpoint: string
  private readonly video: HTMLVideoElement
  private socket: WebSocket | null = null
  private captureTimer: number | null = null
  private captureInFlight = false
  private acceptingFrames = false
  private stopRequested = false
  private stopSent = false
  private disposed = false
  private terminalEventReceived = false
  private frameCount = 0

  constructor(
    video: HTMLVideoElement,
    callbacks: RecognitionSessionCallbacks,
    endpoint = getRecognitionWebSocketUrl(),
  ) {
    this.video = video
    this.callbacks = callbacks
    this.endpoint = endpoint
  }

  start(): void {
    if (this.socket || this.disposed) return

    this.callbacks.onConnecting()
    const socket = new WebSocket(this.endpoint)
    socket.binaryType = 'arraybuffer'
    this.socket = socket

    socket.addEventListener('open', () => {
      if (this.disposed || socket !== this.socket) return
      socket.send(JSON.stringify({ type: 'start' }))
    })

    socket.addEventListener('message', (message) => {
      if (this.disposed || socket !== this.socket) return
      if (typeof message.data !== 'string') {
        this.failClient('서버가 예상하지 못한 형식으로 응답했어요.')
        return
      }

      try {
        const event = parseRecognitionEvent(message.data)

        if (event.type === 'ready') {
          this.acceptingFrames = true
          this.callbacks.onReady()
          this.scheduleCapture(0)
          return
        }

        if (event.type === 'result') {
          this.terminalEventReceived = true
          this.callbacks.onResult({
            text: event.text,
            confidence: event.confidence,
          })
          return
        }

        if (event.type === 'error') {
          this.terminalEventReceived = true
          this.stopCapture()
          this.callbacks.onServerError(event.code, event.message)
          return
        }

        this.terminalEventReceived = true
        this.stopCapture()
        this.callbacks.onStopped()
      } catch (error) {
        this.failClient(
          error instanceof Error ? error.message : '서버 응답을 처리하지 못했어요.',
        )
      }
    })

    socket.addEventListener('error', () => {
      if (!this.disposed && socket === this.socket && !this.terminalEventReceived) {
        this.callbacks.onClientError('립리딩 서버에 연결할 수 없어요.')
      }
    })

    socket.addEventListener('close', (event) => {
      if (socket !== this.socket) return
      this.stopCapture()
      this.socket = null
      if (!this.disposed) this.callbacks.onClosed(event.code, event.wasClean)
    })
  }

  requestStop(): void {
    if (!this.acceptingFrames || this.stopSent || this.disposed) return

    this.stopRequested = true
    if (this.frameCount >= RECOGNITION_MIN_FRAMES && !this.captureInFlight) {
      this.sendStop()
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.stopCapture()

    const socket = this.socket
    this.socket = null
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000)
  }

  private scheduleCapture(delay: number): void {
    if (!this.acceptingFrames || this.disposed || this.captureTimer !== null) return
    this.captureTimer = window.setTimeout(() => {
      this.captureTimer = null
      void this.captureFrame()
    }, delay)
  }

  private async captureFrame(): Promise<void> {
    if (!this.acceptingFrames || this.captureInFlight || this.disposed) return

    const startedAt = performance.now()
    this.captureInFlight = true

    try {
      const socket = this.socket
      if (!socket || socket.readyState !== WebSocket.OPEN) return

      if (socket.bufferedAmount <= RECOGNITION_MAX_BUFFERED_BYTES) {
        const frame = await encodeRecognitionFrame(this.video, this.canvas)
        if (
          frame &&
          this.acceptingFrames &&
          !this.disposed &&
          socket === this.socket &&
          socket.readyState === WebSocket.OPEN
        ) {
          socket.send(frame)
          this.frameCount += 1
          this.callbacks.onFrame(this.frameCount)
        }
      }
    } catch (error) {
      this.failClient(
        error instanceof Error ? error.message : '영상 프레임을 전송하지 못했어요.',
      )
      return
    } finally {
      this.captureInFlight = false
    }

    if (this.stopRequested && this.frameCount >= RECOGNITION_MIN_FRAMES) {
      this.sendStop()
      return
    }

    if (this.frameCount >= RECOGNITION_MAX_FRAMES) {
      this.sendStop()
      return
    }

    const elapsed = performance.now() - startedAt
    this.scheduleCapture(Math.max(0, RECOGNITION_FRAME_INTERVAL_MS - elapsed))
  }

  private sendStop(): void {
    if (this.stopSent || this.disposed) return

    this.stopSent = true
    this.stopCapture()
    const socket = this.socket

    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'stop' }))
      this.callbacks.onFinishing()
    }
  }

  private stopCapture(): void {
    this.acceptingFrames = false
    if (this.captureTimer !== null) {
      window.clearTimeout(this.captureTimer)
      this.captureTimer = null
    }
  }

  private failClient(message: string): void {
    if (this.disposed) return
    this.stopCapture()
    this.callbacks.onClientError(message)
    const socket = this.socket
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000)
  }
}
