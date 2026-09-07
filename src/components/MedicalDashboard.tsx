import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BellRing,
  BedDouble,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  DoorOpen,
  FileClock,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  MessageSquareText,
  RefreshCw,
  Search,
  ShieldAlert,
  Stethoscope,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { ApiError } from '../api/client'
import {
  acknowledgeRequest,
  completeRequest,
  getDashboardSummary,
  getDefaultWardCode,
  getPatientBoard,
  getPatientDetail,
  getPatientRequests,
  getRequests,
  type CommunicationRequest,
  type DashboardSummary,
  type PatientBoardItem,
  type PatientDetail,
  type PatientRequestHistoryItem,
} from '../api/dashboard'
import type { User } from '../api/auth'
import './MedicalDashboard.css'

type DashboardView = 'dashboard' | 'requests' | 'beds' | 'patients' | 'handover'
type RequestFilter = 'ALL' | 'NEW' | 'CRITICAL'

type MedicalDashboardProps = {
  user: User
  sessionToken: string
  onLogout: () => void
}

const navItems: Array<{
  id: DashboardView
  label: string
  icon: typeof LayoutDashboard
}> = [
  { id: 'dashboard', label: '병동 현황', icon: LayoutDashboard },
  { id: 'requests', label: '의사소통 관제', icon: MessageSquareText },
  { id: 'beds', label: '병상 현황', icon: BedDouble },
  { id: 'patients', label: '환자 차트', icon: UsersRound },
  { id: 'handover', label: '근무 인계', icon: FileClock },
]

const pageContent: Record<DashboardView, { title: string; description: string }> = {
  dashboard: {
    title: '병동 의사소통 현황',
    description: '병동 내 환자 의사소통과 임상 대응 현황을 통합 모니터링합니다.',
  },
  requests: {
    title: '의사소통 요청 관제',
    description: '응답 지연 및 고위험 요청을 우선순위에 따라 확인합니다.',
  },
  beds: {
    title: '병상 배정 현황',
    description: '병실별 재원 환자와 의사소통 주의 상태를 확인합니다.',
  },
  patients: {
    title: '환자 의사소통 차트',
    description: '환자별 의사소통 특성, 요청 이력과 임상 특이사항을 조회합니다.',
  },
  handover: {
    title: '근무 인계 브리핑',
    description: '현 근무조의 미처리 요청과 환자별 의사소통 내역을 인계합니다.',
  },
}

const categoryLabels: Record<string, string> = {
  PAIN: '통증',
  REQUEST: '간호 요청',
  REPLY: '의사표현',
  ETC: '기타 임상',
}

const statusLabels: Record<string, string> = {
  NEW: '미확인',
  ACKNOWLEDGED: '확인·조치 중',
  COMPLETED: '조치 완료',
}

const TOTAL_BED_COUNT = 18

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  }).format(new Date(value))
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  }).format(new Date(value))
}

function elapsedLabel(item: CommunicationRequest): string {
  if (item.unacknowledged_seconds !== null) {
    const minutes = Math.max(1, Math.floor(item.unacknowledged_seconds / 60))
    return `${minutes}분째 미확인`
  }
  return `${formatTime(item.requested_at)} 요청`
}

function requestTone(item: CommunicationRequest): 'critical' | 'warning' | 'normal' {
  if (item.priority === 'CRITICAL') return 'critical'
  if (item.priority === 'HIGH' || item.status === 'NEW') return 'warning'
  return 'normal'
}

export function MedicalDashboard({ user, sessionToken, onLogout }: MedicalDashboardProps) {
  const [view, setView] = useState<DashboardView>('dashboard')
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [requests, setRequests] = useState<CommunicationRequest[]>([])
  const [patients, setPatients] = useState<PatientBoardItem[]>([])
  const [requestFilter, setRequestFilter] = useState<RequestFilter>('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedPatient, setSelectedPatient] = useState<PatientDetail | null>(null)
  const [patientHistory, setPatientHistory] = useState<PatientRequestHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [patientLoading, setPatientLoading] = useState(false)
  const [actionRequestId, setActionRequestId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const wardCode = getDefaultWardCode()

  const refresh = useCallback(async (background = false) => {
    if (background) setRefreshing(true)
    else setLoading(true)
    setError('')

    try {
      const [nextSummary, requestPage, patientBoard] = await Promise.all([
        getDashboardSummary(sessionToken, wardCode),
        getRequests(sessionToken, {
          wardCode,
          status: ['NEW', 'ACKNOWLEDGED', 'COMPLETED'],
          sort: 'attention',
          limit: 50,
        }),
        getPatientBoard(sessionToken, wardCode),
      ])
      setSummary(nextSummary)
      setRequests(requestPage.items)
      setPatients(patientBoard.patients)
      setLastUpdatedAt(new Date())
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 403) {
        setError('의료진 권한이 없거나 이 병동에 접근할 수 없는 계정입니다.')
      } else {
        setError(requestError instanceof Error ? requestError.message : '병동 현황 데이터를 불러오지 못했습니다.')
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [sessionToken, wardCode])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(true), 20_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [view])

  const visibleRequests = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase('ko-KR')
    return requests.filter((item) => {
      if (requestFilter === 'NEW' && item.status !== 'NEW') return false
      if (requestFilter === 'CRITICAL' && (item.priority !== 'CRITICAL' || item.status === 'COMPLETED')) return false
      if (!normalizedSearch) return true

      return [item.patient.masked_name, item.patient.room_number, item.text]
        .some((value) => value.toLocaleLowerCase('ko-KR').includes(normalizedSearch))
    })
  }, [requestFilter, requests, searchTerm])

  const openRequestCount = requests.filter((item) => item.status !== 'COMPLETED').length

  const bedSlots = useMemo(() => Array.from({ length: TOTAL_BED_COUNT }, (_, index) => {
    const roomNumber = String(301 + index)
    return {
      roomNumber,
      patient: patients.find((item) => item.room_number === roomNumber) ?? null,
    }
  }), [patients])

  const handoverPatients = useMemo(() => patients
    .map((patient) => {
      const patientRequests = requests.filter((item) => item.patient.patient_id === patient.patient_id)
      const latestRequest = [...patientRequests]
        .sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime())[0]
      return {
        patient,
        total: patientRequests.length,
        pain: patientRequests.filter((item) => item.category === 'PAIN').length,
        pending: patientRequests.filter((item) => item.status !== 'COMPLETED').length,
        latestRequest,
      }
    })
    .filter((item) => item.total > 0 || item.patient.board_status !== 'GREEN')
    .sort((a, b) => b.pending - a.pending || b.total - a.total), [patients, requests])

  const selectPatient = async (patientId: number) => {
    setPatientLoading(true)
    setError('')
    try {
      const [detail, history] = await Promise.all([
        getPatientDetail(sessionToken, patientId),
        getPatientRequests(sessionToken, patientId),
      ])
      setSelectedPatient(detail)
      setPatientHistory(history.items)
      setView('patients')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '환자 의사소통 차트를 불러오지 못했습니다.')
    } finally {
      setPatientLoading(false)
    }
  }

  const mutateRequest = async (item: CommunicationRequest) => {
    setActionRequestId(item.request_id)
    setError('')
    try {
      if (item.status === 'NEW') await acknowledgeRequest(sessionToken, item.request_id)
      else if (item.status === 'ACKNOWLEDGED') await completeRequest(sessionToken, item.request_id)
      await refresh(true)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '의사소통 요청의 조치 상태를 변경하지 못했습니다.')
    } finally {
      setActionRequestId(null)
    }
  }

  const counts = summary?.counts

  return (
    <div className="medical-shell">
      <header className="medical-topbar">
        <button className="medical-brand" onClick={() => setView('dashboard')}>
          <span><Stethoscope size={20} /></span>
          <strong>LipRead Connect</strong>
        </button>
        <div className="staff-account">
          <span className="staff-avatar">{user.display_name.slice(0, 1)}</span>
          <span><strong>{user.display_name}</strong><small>{summary?.ward.ward_name || wardCode} 의료진</small></span>
          <button onClick={onLogout} aria-label="로그아웃"><LogOut size={17} /></button>
        </div>
      </header>

      <aside className="medical-sidebar">
        <p className="sidebar-label">WORKSPACE</p>
        <nav className="medical-nav">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => setView(item.id)}>
                <Icon size={18} /><span>{item.label}</span>
                {item.id === 'requests' && openRequestCount > 0 && <b>{openRequestCount}</b>}
              </button>
            )
          })}
        </nav>
        <div className="sidebar-shift">
          <span>현재 근무</span>
          <strong>14:00 – 22:00</strong>
          <small>20초마다 자동 갱신</small>
        </div>
      </aside>

      <main className="medical-main">
        <div className="medical-page-head">
          <div>
            <span className="page-kicker">{summary?.ward.ward_name || '병동'} · CLINICAL COMMUNICATION</span>
            <h1>{pageContent[view].title}</h1>
            <p>{pageContent[view].description}</p>
          </div>
          <div className="head-actions">
            {lastUpdatedAt && <span><Clock3 size={14} /> {formatTime(lastUpdatedAt.toISOString())} 갱신</span>}
            <button onClick={() => void refresh(true)} disabled={refreshing}>
              <RefreshCw size={16} className={refreshing ? 'spin' : ''} /> 새로고침
            </button>
          </div>
        </div>

        {error && (
          <div className="dashboard-error" role="alert">
            <ShieldAlert size={19} /><span>{error}</span>
            <button onClick={() => void refresh()}>다시 시도</button>
          </div>
        )}

        {loading ? (
          <div className="dashboard-loading"><LoaderCircle size={28} className="spin" /> 병동 현황을 불러오는 중입니다.</div>
        ) : view === 'dashboard' ? (
          <>
            <section className="stat-grid" aria-label="오늘 요약">
              <article><span className="stat-icon green"><UserRound /></span><div><strong>{counts?.patients_registered_today ?? 0}</strong><p>금일 신규 입원</p></div><small>명</small></article>
              <article><span className="stat-icon blue"><ClipboardList /></span><div><strong>{counts?.requests_today ?? 0}</strong><p>금일 의사소통 건</p></div><small>건</small></article>
              <article><span className="stat-icon yellow"><Clock3 /></span><div><strong>{counts?.unacknowledged_requests ?? 0}</strong><p>미확인 의사소통</p></div><small>건</small></article>
              <article className="critical-stat"><span className="stat-icon red"><BellRing /></span><div><strong>{counts?.critical_open_requests ?? 0}</strong><p>고위험 미조치</p></div><small>건</small></article>
            </section>

            <section className="dashboard-grid">
              <article className="dashboard-panel recent-panel">
                <div className="panel-head"><div><h2>최근 의사소통 요청</h2><p>실시간 요청 접수 현황</p></div><button onClick={() => setView('requests')}>관제 화면 <ChevronRight size={15} /></button></div>
                <div className="compact-request-list">
                  {(summary?.recent_requests || []).map((item) => (
                    <button key={item.request_id} className={`compact-request ${requestTone(item)}`} onClick={() => setView('requests')}>
                      <span className="request-indicator" />
                      <span className="request-patient"><strong>{item.patient.room_number}호 {item.patient.masked_name}</strong><small>{categoryLabels[item.category]}</small></span>
                      <span className="request-message">“{item.text}”</span>
                      <span className={`status-chip ${item.status.toLowerCase()}`}>{statusLabels[item.status]}</span>
                      <time>{elapsedLabel(item)}</time>
                    </button>
                  ))}
                  {(summary?.recent_requests.length || 0) === 0 && <p className="empty-row">최근 접수된 요청이 없습니다.</p>}
                </div>
              </article>

              <article className="dashboard-panel ward-panel">
                <div className="panel-head"><div><h2>병상별 주의 현황</h2><p>{summary?.ward.ward_name} 재원 환자</p></div><button onClick={() => setView('beds')}>병상 현황 <ChevronRight size={15} /></button></div>
                <div className="ward-list">
                  {patients.slice(0, 6).map((patient) => (
                    <button key={patient.patient_id} onClick={() => void selectPatient(patient.patient_id)}>
                      <span className={`board-dot ${patient.board_status.toLowerCase()}`} />
                      <strong>{patient.room_number}호 · {patient.masked_name}</strong>
                      <small>
                        {patient.critical_open_count > 0 ? '고위험 요청 즉시 확인' : patient.unacknowledged_request_count > 0 ? `미확인 ${patient.unacknowledged_request_count}건` : '특이 요청 없음'}
                      </small>
                    </button>
                  ))}
                  {patients.length === 0 && <p className="empty-row">등록된 환자가 없습니다.</p>}
                </div>
              </article>

              <article className="dashboard-panel shift-panel">
                <div className="panel-head"><div><h2>현 근무조 처리 요약</h2><p>의사소통 요청 조치 현황</p></div><button onClick={() => setView('handover')}>인계 브리핑 <ChevronRight size={15} /></button></div>
                <div className="shift-summary">
                  <div><span>총 접수</span><strong>{counts?.requests_today ?? 0}</strong></div>
                  <div><span>미확인</span><strong>{counts?.unacknowledged_requests ?? 0}</strong></div>
                  <div><span>조치 중</span><strong>{requests.filter((item) => item.status === 'ACKNOWLEDGED').length}</strong></div>
                  <div><span>조치 완료</span><strong>{requests.filter((item) => item.status === 'COMPLETED').length}</strong></div>
                </div>
                <div className="shift-note"><CheckCircle2 size={18} /> 인계 전 고위험 및 미확인 요청의 조치 상태를 확인하십시오.</div>
              </article>

              <article className="dashboard-panel phrase-panel">
                <div className="panel-head"><div><h2>의사소통 유형 분포</h2><p>금일 요청 임상 분류</p></div></div>
                <div className="category-bars">
                  {Object.entries(categoryLabels).map(([category, label]) => {
                    const count = requests.filter((item) => item.category === category).length
                    const width = requests.length ? Math.max(8, (count / requests.length) * 100) : 8
                    return <div key={category}><span>{label}</span><i><b style={{ width: `${width}%` }} /></i><strong>{count}</strong></div>
                  })}
                </div>
              </article>
            </section>
          </>
        ) : view === 'requests' ? (
          <section className="request-workspace">
            <div className="request-toolbar">
              <div className="filter-tabs">
                <button className={requestFilter === 'ALL' ? 'active' : ''} onClick={() => setRequestFilter('ALL')}>전체 접수 {requests.length}</button>
                <button className={requestFilter === 'NEW' ? 'active' : ''} onClick={() => setRequestFilter('NEW')}>미확인 {requests.filter((item) => item.status === 'NEW').length}</button>
                <button className={requestFilter === 'CRITICAL' ? 'active critical' : ''} onClick={() => setRequestFilter('CRITICAL')}>고위험 {requests.filter((item) => item.priority === 'CRITICAL' && item.status !== 'COMPLETED').length}</button>
              </div>
              <label className="search-box">
                <Search size={16} />
                <input
                  aria-label="요청 검색"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="환자명, 병실, 의사소통 내용 검색"
                />
              </label>
            </div>
            <div className="full-request-list">
              {visibleRequests.map((item) => (
                <article key={item.request_id} className={`request-card ${requestTone(item)}`}>
                  <span className="request-indicator" />
                  <div className="request-card-top">
                    <div><span className={`priority-chip ${requestTone(item)}`}>{item.priority === 'CRITICAL' ? '긴급 확인' : item.status === 'NEW' ? '확인 대기' : statusLabels[item.status]}</span><strong>{item.patient.room_number}호 {item.patient.masked_name}</strong></div>
                    <time>{elapsedLabel(item)}</time>
                  </div>
                  <p>“{item.text}”</p>
                  <div className="request-meta"><span>{formatTime(item.requested_at)}</span><span>{categoryLabels[item.category]}</span><span>{item.confidence == null ? '신뢰도 없음' : `신뢰도 ${Math.round(item.confidence * 100)}%`}</span></div>
                  <div className="request-card-actions">
                    <button className="ghost" onClick={() => void selectPatient(item.patient.patient_id)} disabled={patientLoading}>환자 차트</button>
                    {item.status !== 'COMPLETED' && (
                      <button className="solid" onClick={() => void mutateRequest(item)} disabled={actionRequestId === item.request_id}>
                        {actionRequestId === item.request_id ? <LoaderCircle size={15} className="spin" /> : item.status === 'NEW' ? <Check size={15} /> : <CheckCircle2 size={15} />}
                        {item.status === 'NEW' ? '접수 확인' : '조치 완료'}
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {visibleRequests.length === 0 && <div className="dashboard-loading">조건에 맞는 요청이 없습니다.</div>}
            </div>
          </section>
        ) : view === 'beds' ? (
          <section className="bed-workspace">
            <div className="bed-summary-row">
              <article><span><BedDouble /></span><div><small>운영 병상</small><strong>{TOTAL_BED_COUNT}<b>병상</b></strong></div></article>
              <article><span className="occupied"><UsersRound /></span><div><small>재원 병상</small><strong>{patients.length}<b>병상</b></strong></div></article>
              <article><span className="vacant"><DoorOpen /></span><div><small>가용 병상</small><strong>{Math.max(0, TOTAL_BED_COUNT - patients.length)}<b>병상</b></strong></div></article>
              <article><span className="attention"><ShieldAlert /></span><div><small>주의 관찰</small><strong>{patients.filter((item) => item.board_status !== 'GREEN').length}<b>명</b></strong></div></article>
            </div>
            <article className="dashboard-panel bed-board-panel">
              <div className="panel-head bed-board-head">
                <div><h2>{summary?.ward.ward_name} 병상 배치도</h2><p>환자 병상을 선택하면 의사소통 차트로 이동합니다.</p></div>
                <div className="bed-legend"><span><i className="green" />안정</span><span><i className="yellow" />주의</span><span><i className="red" />긴급</span><span><i className="empty" />공실</span></div>
              </div>
              <div className="bed-grid">
                {bedSlots.map(({ roomNumber, patient }) => patient ? (
                  <button key={roomNumber} className={`bed-card ${patient.board_status.toLowerCase()}`} onClick={() => void selectPatient(patient.patient_id)}>
                    <span className="bed-room"><BedDouble size={17} /> {roomNumber}호</span>
                    <strong>{patient.masked_name}</strong>
                    <small>{patient.patient_code}</small>
                    <b>{patient.critical_open_count > 0 ? '긴급 확인' : patient.unacknowledged_request_count > 0 ? `미확인 ${patient.unacknowledged_request_count}건` : '특이 요청 없음'}</b>
                    <em>차트 보기 <ChevronRight size={13} /></em>
                  </button>
                ) : (
                  <div key={roomNumber} className="bed-card empty">
                    <span className="bed-room"><DoorOpen size={17} /> {roomNumber}호</span>
                    <strong>가용 병상</strong>
                    <small>환자 미배정</small>
                    <b>입원 배정 가능</b>
                  </div>
                ))}
              </div>
            </article>
          </section>
        ) : view === 'patients' ? (
          <section className="patient-workspace">
            <article className="dashboard-panel patient-board-panel">
              <div className="panel-head"><div><h2>재원 환자 목록</h2><p>{patients.length}명 조회</p></div></div>
              <div className="patient-board-grid">
                {patients.map((patient) => (
                  <button key={patient.patient_id} className={selectedPatient?.patient_id === patient.patient_id ? 'active' : ''} onClick={() => void selectPatient(patient.patient_id)}>
                    <span className={`board-dot ${patient.board_status.toLowerCase()}`} />
                    <span><strong>{patient.room_number}호 · {patient.masked_name}</strong><small>{patient.patient_code}</small></span>
                    <b>{patient.unacknowledged_request_count > 0 ? `미확인 ${patient.unacknowledged_request_count}` : '특이 없음'}</b>
                  </button>
                ))}
              </div>
            </article>

            <article className="dashboard-panel patient-detail-panel">
              {patientLoading ? <div className="dashboard-loading"><LoaderCircle className="spin" /> 환자 차트를 불러오는 중입니다.</div> : selectedPatient ? (
                <>
                  <div className="patient-profile-head"><span><UserRound /></span><div><small>{selectedPatient.patient_code}</small><h2>{selectedPatient.room_number}호 {selectedPatient.masked_name}</h2><p>{selectedPatient.ward.ward_name} · 입원일 {formatDate(selectedPatient.admitted_on)}</p></div></div>
                  <div className="patient-info-grid"><div><span>의사소통 기능 상태</span><strong>{selectedPatient.communication_status_label}</strong></div><div><span>보완 의사소통 수단</span><strong>{selectedPatient.assistive_method || '미등록'}</strong></div><div><span>최근 의사표현</span><strong>{selectedPatient.latest_request?.text || '최근 기록 없음'}</strong></div><div><span>미확인 의사소통</span><strong>{selectedPatient.unacknowledged_request_count}건</strong></div></div>
                  <div className="phrase-chips"><h3>고빈도 의사표현</h3>{selectedPatient.frequent_phrases.map((phrase) => <span key={phrase.phrase_code}>{phrase.text}<b>{phrase.count_30d}</b></span>)}</div>
                  {selectedPatient.notes && <p className="patient-note"><Activity size={16} /> {selectedPatient.notes}</p>}
                  <div className="history-list"><h3>구순인식 의사소통 기록</h3>{patientHistory.slice(0, 8).map((item) => <div key={item.request_id}><time>{formatTime(item.requested_at)}</time><span>{item.text}</span><small>{categoryLabels[item.category]}</small><b className={`status-chip ${item.status.toLowerCase()}`}>{statusLabels[item.status]}</b></div>)}</div>
                </>
              ) : <div className="empty-patient"><BedDouble size={34} /><strong>환자 차트를 선택하십시오</strong><p>의사소통 상태와 구순인식 기록이 표시됩니다.</p></div>}
            </article>
          </section>
        ) : (
          <section className="handover-workspace">
            <article className="handover-banner">
              <div className="handover-icon"><ClipboardCheck size={24} /></div>
              <div><span>SHIFT HANDOVER</span><h2>{summary?.ward.ward_name} 의사소통 인계 요약</h2><p>{formatDate(new Date().toISOString())} · 현 근무조 14:00–22:00</p></div>
              <div className="handover-score"><small>인계 대상</small><strong>{handoverPatients.length}<b>명</b></strong></div>
            </article>

            <div className="handover-grid">
              <article className="dashboard-panel handover-patient-panel">
                <div className="panel-head"><div><h2>환자별 의사소통 요약</h2><p>금일 접수 및 미조치 내역</p></div></div>
                <div className="handover-patient-list">
                  {handoverPatients.map(({ patient, total, pain, pending, latestRequest }) => (
                    <button key={patient.patient_id} onClick={() => void selectPatient(patient.patient_id)}>
                      <span className={`handover-room ${patient.board_status.toLowerCase()}`}>{patient.room_number}</span>
                      <span className="handover-patient-name"><strong>{patient.masked_name}</strong><small>{latestRequest ? `최근 “${latestRequest.text}” · ${formatTime(latestRequest.requested_at)}` : '금일 의사소통 기록 없음'}</small></span>
                      <span className="handover-metric"><small>총 접수</small><b>{total}</b></span>
                      <span className="handover-metric"><small>통증</small><b>{pain}</b></span>
                      <span className={`handover-metric ${pending > 0 ? 'pending' : ''}`}><small>미조치</small><b>{pending}</b></span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                  {handoverPatients.length === 0 && <p className="empty-row">인계할 의사소통 기록이 없습니다.</p>}
                </div>
              </article>

              <aside className="handover-side">
                <article className="dashboard-panel handover-alerts">
                  <div className="panel-head"><div><h2>필수 인계 항목</h2><p>다음 근무조 확인 필요</p></div></div>
                  <div className="handover-checklist">
                    <div className={(counts?.critical_open_requests ?? 0) > 0 ? 'urgent' : 'done'}><span>{(counts?.critical_open_requests ?? 0) > 0 ? <ShieldAlert /> : <CheckCircle2 />}</span><p><strong>고위험 요청</strong><small>{counts?.critical_open_requests ?? 0}건 미조치</small></p></div>
                    <div className={(counts?.unacknowledged_requests ?? 0) > 0 ? 'warning' : 'done'}><span>{(counts?.unacknowledged_requests ?? 0) > 0 ? <Clock3 /> : <CheckCircle2 />}</span><p><strong>미확인 의사소통</strong><small>{counts?.unacknowledged_requests ?? 0}건 확인 대기</small></p></div>
                    <div className="done"><span><CheckCircle2 /></span><p><strong>환자별 특이사항</strong><small>차트 기록 검토 완료</small></p></div>
                    <div className="done"><span><CheckCircle2 /></span><p><strong>보호자 전달사항</strong><small>별도 전달사항 없음</small></p></div>
                  </div>
                </article>
                <article className="handover-note-card"><FileClock size={20} /><div><strong>인계 메모</strong><p>302호 자세 변경 요청 조치 중. 303호 호흡 불편 호소 건을 우선 확인하십시오.</p></div></article>
              </aside>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
