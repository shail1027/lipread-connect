# LipRead Connect

발성이 어려운 사용자의 입 모양을 한국어 문장으로 전달하기 위한 웹 인터페이스입니다. [HumanRhoid/hanium-lipreading](https://github.com/HumanRhoid/hanium-lipreading) 프로젝트의 모델·백엔드와 연결하는 것을 목표로 합니다.

## 현재 구현

- 브라우저 카메라 권한 요청 및 전면 카메라 접근
- 사용자에게 자연스러운 좌우 미러링 영상 제공
- 카메라 권한 거절·미지원·사용 중 오류 처리
- FastAPI v1 WebSocket 립리딩 세션 연결
- 640x360 JPEG 프레임을 약 25fps로 binary 전송
- 인식 시작/중지, 서버 오류, 최종 문장과 신뢰도 표시
- 인식 결과 Web Speech API 읽어주기
- 모바일·태블릿·데스크톱 반응형 UI
- 오디오 미수집 및 영상 비저장 안내

## 실행

```bash
npm install
npm run dev
```

다른 터미널에서 백엔드를 실행한 뒤 프론트엔드를 시작합니다.

```bash
# hanium-lipreading 저장소
cp .env.example .env
docker compose up -d db
uv run alembic upgrade head
uv run uvicorn src.backend.main:app --reload --port 8000

# lipread-connect 저장소
cp .env.example .env
npm run dev
```

카메라 API는 보안 컨텍스트에서만 동작하므로 로컬 개발 환경(`localhost`) 또는 HTTPS로 접속해야 합니다.

## 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `VITE_RECOGNITION_WS_URL` | `ws://localhost:8000/api/v1/recognition/stream` | FastAPI v1 립리딩 WebSocket endpoint |

로컬 프론트 주소는 백엔드의 `ALLOWED_ORIGINS`에 포함되어야 합니다. 기본 구성은 `http://localhost:5173`을 허용합니다. HTTPS로 배포할 때는 WebSocket 주소도 `wss://`를 사용해야 합니다.

## 인식 흐름

1. 카메라를 켠 뒤 인식을 시작합니다.
2. 클라이언트가 WebSocket 연결 직후 `start`를 보내고 `ready`를 기다립니다.
3. `ready` 이후 카메라 영상을 640x360 JPEG binary로 전송합니다.
4. 인식을 멈추면 최소 30프레임을 확보한 뒤 `stop`을 보냅니다.
5. 서버의 최종 `result`와 `stopped` 이벤트를 화면에 반영합니다.

## 기술 스택

- React 18
- TypeScript
- Vite 5
- MediaDevices API
- Lucide React
