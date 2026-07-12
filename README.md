# 입모아 (LipRead Connect)

발성이 어려운 사용자의 입 모양을 한국어 문장으로 전달하기 위한 웹 인터페이스입니다. [HumanRhoid/hanium-lipreading](https://github.com/HumanRhoid/hanium-lipreading) 프로젝트의 모델·백엔드와 연결하는 것을 목표로 합니다.

## 현재 구현

- 브라우저 카메라 권한 요청 및 전면 카메라 접근
- 사용자에게 자연스러운 좌우 미러링 영상 제공
- 카메라 권한 거절·미지원·사용 중 오류 처리
- 인식 시작/중지 상태와 모델 결과 표시 영역
- 모바일·태블릿·데스크톱 반응형 UI
- 오디오 미수집 및 영상 비저장 안내

모델과 백엔드가 준비되면 FastAPI WebSocket 스트림을 연결해 실시간 텍스트를 표시할 예정입니다.

## 실행

```bash
npm install
npm run dev
```

카메라 API는 보안 컨텍스트에서만 동작하므로 로컬 개발 환경(`localhost`) 또는 HTTPS로 접속해야 합니다.

## 기술 스택

- React 18
- TypeScript
- Vite 5
- MediaDevices API
- Lucide React
