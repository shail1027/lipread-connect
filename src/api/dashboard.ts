import { apiRequest } from './client'

export type StaffActor = {
  user_id: number
  display_name: string
}

export type Ward = {
  ward_code: string
  ward_name: string
}

export type RequestPatient = {
  patient_id: number
  patient_code: string
  masked_name: string
  ward_code: string
  ward_name: string
  room_number: string
}

export type RequestStatus = 'NEW' | 'ACKNOWLEDGED' | 'COMPLETED'
export type RequestPriority = 'NORMAL' | 'HIGH' | 'CRITICAL'
export type RequestCategory = 'PAIN' | 'REQUEST' | 'REPLY' | 'ETC'
export type BoardStatus = 'GREEN' | 'YELLOW' | 'RED'

export type CommunicationRequest = {
  request_id: number
  patient: RequestPatient
  utterance_id: number
  text: string
  phrase_code: string | null
  category: RequestCategory
  confidence: number | null
  priority: RequestPriority
  status: RequestStatus
  requested_at: string
  unacknowledged_seconds: number | null
  acknowledged_at: string | null
  acknowledged_by: StaffActor | null
  completed_at: string | null
  completed_by: StaffActor | null
}

export type DashboardSummary = {
  generated_at: string
  timezone: string
  ward: Ward
  counts: {
    patients_registered_today: number
    requests_today: number
    unacknowledged_requests: number
    critical_open_requests: number
  }
  recent_requests: CommunicationRequest[]
}

export type RequestTimelineEvent = {
  event_type: 'REQUESTED' | 'ACKNOWLEDGED' | 'COMPLETED'
  occurred_at: string
  actor: StaffActor | null
  note: string | null
}

export type RequestDetail = CommunicationRequest & {
  resolution_note: string | null
  timeline: RequestTimelineEvent[]
}

export type PatientLatestRequest = {
  request_id: number
  text: string
  status: RequestStatus
  priority: RequestPriority
  requested_at: string
}

export type PatientBoardItem = {
  patient_id: number
  patient_code: string
  masked_name: string
  room_number: string
  board_status: BoardStatus
  open_request_count: number
  unacknowledged_request_count: number
  critical_open_count: number
  latest_request: PatientLatestRequest | null
}

export type PatientDetail = {
  patient_id: number
  patient_code: string
  masked_name: string
  ward: Ward
  room_number: string
  admitted_on: string
  communication_status: string
  communication_status_label: string
  assistive_method: string | null
  notes: string | null
  open_request_count: number
  unacknowledged_request_count: number
  latest_request: PatientLatestRequest | null
  frequent_phrases: Array<{
    phrase_code: string
    text: string
    count_30d: number
  }>
  today_summary: {
    date: string
    total_requests: number
    by_category: Record<string, number>
    by_phrase: Array<{
      phrase_code: string
      text: string
      count: number
    }>
  }
}

export type PatientRequestHistoryItem = Omit<CommunicationRequest, 'patient' | 'unacknowledged_seconds'>

type RequestListResponse = {
  items: CommunicationRequest[]
  next_cursor: string | null
}

type PatientBoardResponse = {
  ward: Ward
  generated_at: string
  patients: PatientBoardItem[]
}

type PatientRequestHistoryResponse = {
  items: PatientRequestHistoryItem[]
  next_cursor: string | null
}

const DEFAULT_WARD_CODE = import.meta.env.VITE_DEFAULT_WARD_CODE?.trim() || 'WARD-3'

function queryString(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value))
  })
  return query.toString()
}

export const getDefaultWardCode = () => DEFAULT_WARD_CODE

export const getDashboardSummary = (
  sessionToken: string,
  wardCode = DEFAULT_WARD_CODE,
) => apiRequest<DashboardSummary>(
  `/api/v1/dashboard/summary?${queryString({ ward_code: wardCode, recent_limit: 5 })}`,
  { sessionToken },
)

export const getRequests = (
  sessionToken: string,
  options: {
    wardCode?: string
    status?: RequestStatus[]
    priority?: RequestPriority[]
    category?: RequestCategory
    patientId?: number
    sort?: 'attention' | 'newest'
    cursor?: string
    limit?: number
  } = {},
) => apiRequest<RequestListResponse>(
  `/api/v1/requests?${queryString({
    ward_code: options.wardCode || DEFAULT_WARD_CODE,
    status: options.status?.join(','),
    priority: options.priority?.join(','),
    category: options.category,
    patient_id: options.patientId,
    sort: options.sort || 'attention',
    cursor: options.cursor,
    limit: options.limit || 50,
  })}`,
  { sessionToken },
)

function idempotencyKey(operation: string, requestId: number): string {
  return `${operation}-${requestId}-${crypto.randomUUID()}`
}

export const acknowledgeRequest = (
  sessionToken: string,
  requestId: number,
  note?: string,
) => apiRequest<RequestDetail>(`/api/v1/requests/${requestId}/acknowledge`, {
  method: 'POST',
  sessionToken,
  headers: { 'Idempotency-Key': idempotencyKey('ack', requestId) },
  body: JSON.stringify({ note: note || null }),
})

export const completeRequest = (
  sessionToken: string,
  requestId: number,
  resolutionNote?: string,
) => apiRequest<RequestDetail>(`/api/v1/requests/${requestId}/complete`, {
  method: 'POST',
  sessionToken,
  headers: { 'Idempotency-Key': idempotencyKey('complete', requestId) },
  body: JSON.stringify({ resolution_note: resolutionNote || null }),
})

export const getPatientBoard = (
  sessionToken: string,
  wardCode = DEFAULT_WARD_CODE,
) => apiRequest<PatientBoardResponse>(
  `/api/v1/patients?${queryString({ ward_code: wardCode })}`,
  { sessionToken },
)

export const getPatientDetail = (sessionToken: string, patientId: number) =>
  apiRequest<PatientDetail>(`/api/v1/patients/${patientId}`, { sessionToken })

export const getPatientRequests = (
  sessionToken: string,
  patientId: number,
  limit = 50,
) => apiRequest<PatientRequestHistoryResponse>(
  `/api/v1/patients/${patientId}/requests?${queryString({ limit })}`,
  { sessionToken },
)
