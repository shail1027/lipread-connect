export const MIN_RECORDING_MS = 3_000
export const MAX_RECORDING_MS = 10_000

const MIME_TYPE_CANDIDATES = [
  'video/mp4;codecs=h264',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
]

function getSupportedMimeType(): string | undefined {
  return MIME_TYPE_CANDIDATES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType))
}

export class VideoRecordingSession {
  private readonly recorder: MediaRecorder
  private readonly chunks: Blob[] = []
  private startedAt = 0
  private stopPromise: Promise<Blob> | null = null
  private cancelled = false

  constructor(stream: MediaStream) {
    if (!('MediaRecorder' in window)) {
      throw new Error('이 브라우저에서는 영상 녹화를 지원하지 않아요.')
    }

    const mimeType = getSupportedMimeType()
    this.recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    this.recorder.addEventListener('dataavailable', (event) => {
      if (!this.cancelled && event.data.size > 0) this.chunks.push(event.data)
    })
  }

  start(): void {
    if (this.recorder.state !== 'inactive') return
    this.startedAt = performance.now()
    this.recorder.start(250)
  }

  get elapsedMs(): number {
    return this.startedAt ? performance.now() - this.startedAt : 0
  }

  stop(): Promise<Blob> {
    if (this.stopPromise) return this.stopPromise

    this.stopPromise = new Promise<Blob>((resolve, reject) => {
      if (this.recorder.state === 'inactive') {
        reject(new Error('녹화가 시작되지 않았어요.'))
        return
      }

      this.recorder.addEventListener(
        'stop',
        () => {
          const blob = new Blob(this.chunks, {
            type: this.recorder.mimeType || this.chunks[0]?.type || 'video/webm',
          })
          if (blob.size === 0) {
            reject(new Error('녹화된 영상이 비어 있어요.'))
            return
          }
          resolve(blob)
        },
        { once: true },
      )
      this.recorder.addEventListener(
        'error',
        () => reject(new Error('영상을 녹화하지 못했어요.')),
        { once: true },
      )
      this.recorder.stop()
    })

    return this.stopPromise
  }

  cancel(): void {
    this.cancelled = true
    this.chunks.length = 0
    if (this.recorder.state !== 'inactive') this.recorder.stop()
  }
}
