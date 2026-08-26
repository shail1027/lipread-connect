import { apiRequest } from './client'

export type InferenceJobState =
  | 'QUEUED'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'COMPLETED'
  | 'FAILED'

export type InferenceResult = {
  utterance_id: number
  text: string
  phrase_code: string | null
  confidence: number | null
  model_version: string | null
  created_at: string
}

export type VideoUploadResponse = {
  utterance_id: number
  video_id: number
  job_id: string
  status: 'QUEUED'
  duplicate: boolean
}

export type InferenceJobResponse = {
  job_id: string
  utterance_id: number
  video_id: number
  status: InferenceJobState
  error_code: string | null
  result: InferenceResult | null
}

export async function uploadRecognitionVideo(
  video: Blob,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<VideoUploadResponse> {
  const mimeType = video.type || 'video/webm'
  const extension = mimeType.includes('mp4') ? 'mp4' : 'webm'
  const formData = new FormData()

  formData.append('file', video, `recognition-${crypto.randomUUID()}.${extension}`)
  formData.append('mode', 'CLOSED')

  return apiRequest<VideoUploadResponse>('/api/v1/recognition/videos', {
    method: 'POST',
    body: formData,
    sessionToken,
    signal,
    headers: {
      'Idempotency-Key': crypto.randomUUID(),
    },
    acceptedStatuses: [200],
  })
}

export const getInferenceJob = (
  jobId: string,
  sessionToken: string,
  signal?: AbortSignal,
) =>
  apiRequest<InferenceJobResponse>(`/api/v1/inference-jobs/${jobId}`, {
    sessionToken,
    signal,
  })

const POLL_INTERVAL_MS = 700
const POLL_TIMEOUT_MS = 60_000

export async function waitForInferenceResult(
  jobId: string,
  sessionToken: string,
  options: {
    signal?: AbortSignal
    onStatus?: (status: InferenceJobState) => void
  } = {},
): Promise<InferenceResult> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    if (options.signal?.aborted) throw new DOMException('요청이 취소됐습니다.', 'AbortError')

    const job = await getInferenceJob(jobId, sessionToken, options.signal)
    options.onStatus?.(job.status)

    if (job.status === 'FAILED') {
      throw new Error(
        job.error_code
          ? `영상 처리에 실패했어요. (${job.error_code})`
          : '영상 처리에 실패했어요.',
      )
    }

    if (job.status === 'SUCCEEDED' || job.status === 'COMPLETED') {
      if (!job.result) throw new Error('완료된 인식 결과가 서버 응답에 없어요.')
      return job.result
    }

    await new Promise<void>((resolve, reject) => {
      const handleAbort = () => {
        window.clearTimeout(timer)
        reject(new DOMException('요청이 취소됐습니다.', 'AbortError'))
      }
      const timer = window.setTimeout(() => {
        options.signal?.removeEventListener('abort', handleAbort)
        resolve()
      }, POLL_INTERVAL_MS)
      options.signal?.addEventListener('abort', handleAbort, { once: true })
    })
  }

  throw new Error('인식 시간이 길어지고 있어요. 잠시 후 다시 시도해 주세요.')
}
