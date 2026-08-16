import { apiRequest } from './client'

export type Readiness = {
  status: 'ready' | 'not_ready'
  database: 'ready' | 'not_ready'
  inference: 'ready' | 'not_ready'
}

export const getLiveness = () =>
  apiRequest<{ status: 'ok' }>('/health/live')

export const getReadiness = () =>
  apiRequest<Readiness>('/health/ready', { acceptedStatuses: [503] })
