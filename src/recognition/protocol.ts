export const RECOGNITION_FRAME_WIDTH = 640
export const RECOGNITION_FRAME_HEIGHT = 360
export const RECOGNITION_FRAME_INTERVAL_MS = 40
export const RECOGNITION_MIN_FRAMES = 30
export const RECOGNITION_MAX_FRAMES = 250
export const RECOGNITION_MAX_FRAME_BYTES = 512 * 1024
export const RECOGNITION_MAX_BUFFERED_BYTES = 1024 * 1024

export type RecognitionErrorCode =
  | 'INVALID_MESSAGE'
  | 'UNSUPPORTED_MODE'
  | 'INVALID_FRAME'
  | 'FRAME_TOO_LARGE'
  | 'VIDEO_TOO_LONG'
  | 'VIDEO_TOO_LARGE'
  | 'INSUFFICIENT_FRAMES'
  | 'MODEL_NOT_READY'
  | 'SERVER_BUSY'
  | 'STREAM_IDLE_TIMEOUT'
  | 'SESSION_LIMIT_REACHED'
  | 'INTERNAL_ERROR'

export type RecognitionServerEvent =
  | { type: 'ready' }
  | { type: 'result'; text: string; final: true; confidence: number | null }
  | { type: 'error'; code: RecognitionErrorCode; message: string }
  | { type: 'stopped' }

const errorCodes = new Set<RecognitionErrorCode>([
  'INVALID_MESSAGE',
  'UNSUPPORTED_MODE',
  'INVALID_FRAME',
  'FRAME_TOO_LARGE',
  'VIDEO_TOO_LONG',
  'VIDEO_TOO_LARGE',
  'INSUFFICIENT_FRAMES',
  'MODEL_NOT_READY',
  'SERVER_BUSY',
  'STREAM_IDLE_TIMEOUT',
  'SESSION_LIMIT_REACHED',
  'INTERNAL_ERROR',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export function parseRecognitionEvent(raw: string): RecognitionServerEvent {
  let payload: unknown

  try {
    payload = JSON.parse(raw)
  } catch {
    throw new Error('서버가 올바르지 않은 응답을 보냈어요.')
  }

  if (!isRecord(payload) || typeof payload.type !== 'string') {
    throw new Error('서버 응답 형식을 확인할 수 없어요.')
  }

  if (payload.type === 'ready' || payload.type === 'stopped') {
    return { type: payload.type }
  }

  if (
    payload.type === 'result' &&
    typeof payload.text === 'string' &&
    payload.text.trim().length > 0 &&
    payload.final === true &&
    (payload.confidence === null ||
      payload.confidence === undefined ||
      (typeof payload.confidence === 'number' &&
        Number.isFinite(payload.confidence) &&
        payload.confidence >= 0 &&
        payload.confidence <= 1))
  ) {
    return {
      type: 'result',
      text: payload.text,
      final: true,
      confidence: payload.confidence ?? null,
    }
  }

  if (
    payload.type === 'error' &&
    typeof payload.code === 'string' &&
    errorCodes.has(payload.code as RecognitionErrorCode) &&
    typeof payload.message === 'string' &&
    payload.message.trim().length > 0
  ) {
    return {
      type: 'error',
      code: payload.code as RecognitionErrorCode,
      message: payload.message,
    }
  }

  throw new Error('지원하지 않는 서버 응답을 받았어요.')
}

export function getRecognitionWebSocketUrl(): string {
  const configuredUrl = import.meta.env.VITE_RECOGNITION_WS_URL?.trim()
  const fallbackProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const fallbackUrl = `${fallbackProtocol}//localhost:8000/api/v1/recognition/stream`
  const url = new URL(configuredUrl || fallbackUrl)

  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new Error('립리딩 서버 주소는 ws:// 또는 wss:// 형식이어야 해요.')
  }

  return url.toString()
}
