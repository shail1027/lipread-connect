import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BellRing,
  BedDouble,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
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

type DashboardView = 'dashboard' | 'requests' | 'patients'
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
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
  { id: 'requests', label: '요청 관리', icon: MessageSquareText },
  { id: 'patients', label: '환자 관리', icon: UsersRound },
]

const categoryLabels: Record<string, string> = {
  PAIN: '통증',
  REQUEST: '일반 요청',
  REPLY: '응답',
  ETC: '기타',
}

const statusLabels: Record<string, string> = {
  NEW: '새 요청',
  ACKNOWLEDGED: '확인됨',
  COMPLETED: '처리 완료',
}

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
        setError(requestError instanceof Error ? requestError.message : '대시보드 정보를 불러오지 못했어요.')
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
      setError(requestError instanceof Error ? requestError.message : '환자 정보를 불러오지 못했어요.')
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
      setError(requestError instanceof Error ? requestError.message : '요청 상태를 변경하지 못했어요.')
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
            <span className="page-kicker">{summary?.ward.ward_name || '병동'} WORKSPACE</span>
            <h1>{view === 'dashboard' ? '의료진 대시보드' : view === 'requests' ? '의사소통 요청' : '환자 관리'}</h1>
            <p>
              {view === 'dashboard' && '환자 현황과 요청을 한눈에 확인하세요.'}
              {view === 'requests' && '오래 기다린 요청과 중요 요청이 먼저 표시돼요.'}
              {view === 'patients' && '환자별 립리딩 기록과 의사소통 상태를 확인하세요.'}
            </p>
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
          <div className="dashboard-loading"><LoaderCircle size={28} className="spin" /> 대시보드를 준비하고 있어요.</div>
        ) : view === 'dashboard' ? (
          <>
            <section className="stat-grid" aria-label="오늘 요약">
              <article><span className="stat-icon green"><UserRound /></span><div><strong>{counts?.patients_registered_today ?? 0}</strong><p>오늘 등록 환자</p></div><small>명</small></article>
              <article><span className="stat-icon blue"><ClipboardList /></span><div><strong>{counts?.requests_today ?? 0}</strong><p>오늘 의사소통 요청</p></div><small>건</small></article>
              <article><span className="stat-icon yellow"><Clock3 /></span><div><strong>{counts?.unacknowledged_requests ?? 0}</strong><p>미확인 요청</p></div><small>건</small></article>
              <article className="critical-stat"><span className="stat-icon red"><BellRing /></span><div><strong>{counts?.critical_open_requests ?? 0}</strong><p>중요 요청</p></div><small>건</small></article>
            </section>

            <section className="dashboard-grid">
              <article className="dashboard-panel recent-panel">
                <div className="panel-head"><div><h2>최근 요청</h2><p>실시간 립리딩 요청</p></div><button onClick={() => setView('requests')}>전체 보기 <ChevronRight size={15} /></button></div>
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
                  {(summary?.recent_requests.length || 0) === 0 && <p className="empty-row">최근 요청이 없습니다.</p>}
                </div>
              </article>

              <article className="dashboard-panel ward-panel">
                <div className="panel-head"><div><h2>병상·환자 상태</h2><p>{summary?.ward.ward_name}</p></div><button onClick={() => setView('patients')}>환자 관리 <ChevronRight size={15} /></button></div>
                <div className="ward-list">
                  {patients.slice(0, 6).map((patient) => (
                    <button key={patient.patient_id} onClick={() => void selectPatient(patient.patient_id)}>
                      <span className={`board-dot ${patient.board_status.toLowerCase()}`} />
                      <strong>{patient.room_number}호 · {patient.masked_name}</strong>
                      <small>
                        {patient.critical_open_count > 0 ? '중요 요청 확인 필요' : patient.unacknowledged_request_count > 0 ? `새 요청 ${patient.unacknowledged_request_count}건` : '요청 없음'}
                      </small>
                    </button>
                  ))}
                  {patients.length === 0 && <p className="empty-row">등록된 환자가 없습니다.</p>}
                </div>
              </article>

              <article className="dashboard-panel shift-panel">
                <div className="panel-head"><div><h2>교대 근무 요약</h2><p>현재 병동의 요청 처리 현황</p></div></div>
                <div className="shift-summary">
                  <div><span>오늘 요청</span><strong>{counts?.requests_today ?? 0}</strong></div>
                  <div><span>확인 대기</span><strong>{counts?.unacknowledged_requests ?? 0}</strong></div>
                  <div><span>확인 완료</span><strong>{requests.filter((item) => item.status === 'ACKNOWLEDGED').length}</strong></div>
                  <div><span>처리 완료</span><strong>{requests.filter((item) => item.status === 'COMPLETED').length}</strong></div>
                </div>
                <div className="shift-note"><CheckCircle2 size={18} /> 인계 전 중요 요청과 미확인 요청을 다시 확인해 주세요.</div>
              </article>

              <article className="dashboard-panel phrase-panel">
                <div className="panel-head"><div><h2>운영 상태</h2><p>요청 분류 현황</p></div></div>
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
                <button className={requestFilter === 'ALL' ? 'active' : ''} onClick={() => setRequestFilter('ALL')}>전체 {requests.length}</button>
                <button className={requestFilter === 'NEW' ? 'active' : ''} onClick={() => setRequestFilter('NEW')}>미확인 {requests.filter((item) => item.status === 'NEW').length}</button>
                <button className={requestFilter === 'CRITICAL' ? 'active critical' : ''} onClick={() => setRequestFilter('CRITICAL')}>중요 {requests.filter((item) => item.priority === 'CRITICAL' && item.status !== 'COMPLETED').length}</button>
              </div>
              <label className="search-box">
                <Search size={16} />
                <input
                  aria-label="요청 검색"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="환자명, 병실, 요청 검색"
                />
              </label>
            </div>
            <div className="full-request-list">
              {visibleRequests.map((item) => (
                <article key={item.request_id} className={`request-card ${requestTone(item)}`}>
                  <span className="request-indicator" />
                  <div className="request-card-top">
                    <div><span className={`priority-chip ${requestTone(item)}`}>{item.priority === 'CRITICAL' ? '중요' : item.status === 'NEW' ? '새 요청' : statusLabels[item.status]}</span><strong>{item.patient.room_number}호 {item.patient.masked_name}</strong></div>
                    <time>{elapsedLabel(item)}</time>
                  </div>
                  <p>“{item.text}”</p>
                  <div className="request-meta"><span>{formatTime(item.requested_at)}</span><span>{categoryLabels[item.category]}</span><span>{item.confidence == null ? '신뢰도 없음' : `신뢰도 ${Math.round(item.confidence * 100)}%`}</span></div>
                  <div className="request-card-actions">
                    <button className="ghost" onClick={() => void selectPatient(item.patient.patient_id)} disabled={patientLoading}>환자 정보</button>
                    {item.status !== 'COMPLETED' && (
                      <button className="solid" onClick={() => void mutateRequest(item)} disabled={actionRequestId === item.request_id}>
                        {actionRequestId === item.request_id ? <LoaderCircle size={15} className="spin" /> : item.status === 'NEW' ? <Check size={15} /> : <CheckCircle2 size={15} />}
                        {item.status === 'NEW' ? '요청 확인' : '처리 완료'}
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {visibleRequests.length === 0 && <div className="dashboard-loading">조건에 맞는 요청이 없습니다.</div>}
            </div>
          </section>
        ) : (
          <section className="patient-workspace">
            <article className="dashboard-panel patient-board-panel">
              <div className="panel-head"><div><h2>병동 환자 현황</h2><p>{patients.length}명 등록</p></div></div>
              <div className="patient-board-grid">
                {patients.map((patient) => (
                  <button key={patient.patient_id} className={selectedPatient?.patient_id === patient.patient_id ? 'active' : ''} onClick={() => void selectPatient(patient.patient_id)}>
                    <span className={`board-dot ${patient.board_status.toLowerCase()}`} />
                    <span><strong>{patient.room_number}호 · {patient.masked_name}</strong><small>{patient.patient_code}</small></span>
                    <b>{patient.unacknowledged_request_count > 0 ? `미확인 ${patient.unacknowledged_request_count}` : '안정'}</b>
                  </button>
                ))}
              </div>
            </article>

            <article className="dashboard-panel patient-detail-panel">
              {patientLoading ? <div className="dashboard-loading"><LoaderCircle className="spin" /> 환자 정보를 불러오는 중</div> : selectedPatient ? (
                <>
                  <div className="patient-profile-head"><span><UserRound /></span><div><small>{selectedPatient.patient_code}</small><h2>{selectedPatient.room_number}호 {selectedPatient.masked_name}</h2><p>{selectedPatient.ward.ward_name} · 입원일 {formatDate(selectedPatient.admitted_on)}</p></div></div>
                  <div className="patient-info-grid"><div><span>의사소통 상태</span><strong>{selectedPatient.communication_status_label}</strong></div><div><span>보조 방식</span><strong>{selectedPatient.assistive_method || '등록되지 않음'}</strong></div><div><span>최근 요청</span><strong>{selectedPatient.latest_request?.text || '요청 없음'}</strong></div><div><span>미확인 요청</span><strong>{selectedPatient.unacknowledged_request_count}건</strong></div></div>
                  <div className="phrase-chips"><h3>자주 사용하는 표현</h3>{selectedPatient.frequent_phrases.map((phrase) => <span key={phrase.phrase_code}>{phrase.text}<b>{phrase.count_30d}</b></span>)}</div>
                  {selectedPatient.notes && <p className="patient-note"><Activity size={16} /> {selectedPatient.notes}</p>}
                  <div className="history-list"><h3>립리딩 기록</h3>{patientHistory.slice(0, 8).map((item) => <div key={item.request_id}><time>{formatTime(item.requested_at)}</time><span>{item.text}</span><small>{categoryLabels[item.category]}</small><b className={`status-chip ${item.status.toLowerCase()}`}>{statusLabels[item.status]}</b></div>)}</div>
                </>
              ) : <div className="empty-patient"><BedDouble size={34} /><strong>환자를 선택해 주세요</strong><p>환자 상세 정보와 립리딩 기록이 여기에 표시됩니다.</p></div>}
            </article>
          </section>
        )}
      </main>
    </div>
  )
}
