# LipRead Connect

발성이 어려운 사용자의 입 모양을 한국어 문장으로 전달하기 위한 웹 인터페이스입니다. [HumanRhoid/hanium-lipreading](https://github.com/HumanRhoid/hanium-lipreading) 프로젝트의 모델·백엔드와 연결하는 것을 목표로 합니다.

## 현재 구현

- 브라우저 카메라 권한 요청 및 전면 카메라 접근
- 사용자에게 자연스러운 좌우 미러링 영상 제공
- 카메라 권한 거절·미지원·사용 중 오류 처리
- FastAPI v1 비동기 영상 업로드·추론 Job 연결
- 백엔드 liveness/readiness 상태 확인
- 일반 사용자 회원가입, 로그인, 세션 복원, 로그아웃
- 640x360 무음 영상을 3~10초간 녹화해 MP4 또는 WebM으로 전송
- 인식 시작/중지, Job 상태 폴링, 서버 오류, 최종 문장과 신뢰도 표시
- 인식 결과 Web Speech API 읽어주기
- 모바일·태블릿·데스크톱 반응형 UI
- 오디오 미수집 및 추론용 영상 임시 업로드 안내

## 실행

```bash
npm install
npm run dev
```

다른 터미널에서 백엔드를 실행한 뒤 프론트엔드를 시작합니다.

```bash
# hanium-lipreading 저장소: PostgreSQL, Redis, MinIO
cp .env.example .env
docker compose up -d --wait postgres redis minio minio-init
uv run alembic upgrade head
uv run python scripts/sync_closed_phrases.py
uv run uvicorn src.backend.main:app --reload --port 8000

# 별도 터미널에서 비동기 추론 Worker 실행
uv run python -m src.backend.recognition.worker_main

# lipread-connect 저장소
cp .env.example .env
npm run dev
```

카메라 API는 보안 컨텍스트에서만 동작하므로 로컬 개발 환경(`localhost`) 또는 HTTPS로 접속해야 합니다.

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000` | health, 인증, 영상 인식 HTTP API origin |

로컬 프론트 주소는 백엔드의 `ALLOWED_ORIGINS`에 포함되어야 합니다. 기본 구성은 `http://localhost:5173`을 허용합니다.

## 인식 흐름

1. 카메라를 켠 뒤 인식을 시작합니다.
2. 브라우저가 오디오 없이 640x360 영상을 녹화합니다.
3. 사용자가 종료를 누르면 최소 3초를 확보하고, 최대 10초에는 자동 종료합니다.
4. 영상을 `POST /api/v1/recognition/videos`에 업로드합니다.
5. 반환된 `job_id`로 상태를 조회하다가 완료된 최종 문장과 신뢰도를 표시합니다.

## 연결된 API

| 방식 | 경로 | 사용처 |
|---|---|---|
| `GET` | `/health/live` | 백엔드 프로세스 연결 확인 |
| `GET` | `/health/ready` | 데이터베이스와 추론 모델 준비 상태 표시 |
| `POST` | `/api/v1/auth/signup` | 일반 사용자 회원가입 |
| `POST` | `/api/v1/auth/login` | 로그인 세션 발급 |
| `GET` | `/api/v1/auth/me` | 로그인 사용자 확인과 세션 복원 |
| `POST` | `/api/v1/auth/logout` | 로그인 세션 무효화 |
| `POST` | `/api/v1/recognition/videos` | 녹화 영상 업로드와 추론 Job 생성 |
| `GET` | `/api/v1/inference-jobs/{job_id}` | 추론 상태와 최종 결과 조회 |

로그인 세션 토큰은 브라우저 탭의 `sessionStorage`에만 보관하며 인증 HTTP 요청의 `X-Session-Token` 헤더로 전송합니다.

## 기술 스택

- React 18
- TypeScript
- Vite 5
- MediaDevices API
- MediaRecorder API
- Lucide React
