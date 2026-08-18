export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

type RequestOptions = RequestInit & {
  acceptedStatuses?: number[]
  sessionToken?: string
}

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:8000'
).replace(/\/$/, '')

function getErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object' || !('detail' in payload)) {
    return '서버 요청을 처리하지 못했어요.'
  }

  const detail = payload.detail
  if (typeof detail === 'string') return detail

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (!item || typeof item !== 'object' || !('msg' in item)) return null
        return typeof item.msg === 'string' ? item.msg : null
      })
      .filter((message): message is string => Boolean(message))
    if (messages.length > 0) return messages.join(' ')
  }

  return '입력값을 확인해 주세요.'
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { acceptedStatuses = [], sessionToken, headers, ...requestInit } = options
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestInit,
    headers: {
      ...(requestInit.body ? { 'Content-Type': 'application/json' } : {}),
      ...(sessionToken ? { 'X-Session-Token': sessionToken } : {}),
      ...headers,
    },
  })

  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok && !acceptedStatuses.includes(response.status)) {
    throw new ApiError(getErrorMessage(payload), response.status)
  }

  return payload as T
}
