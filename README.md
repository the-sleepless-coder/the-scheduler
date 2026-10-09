# The Scheduler

타임박싱 기반 일정 관리 앱. Monthly / Weekly / Daily 페이지로 확장 예정.

## 스택

- **Frontend**: React + Vite (포트 **5003**)
- **Backend**: NestJS + TypeORM + JWT (포트 **5004**)
- **DB**: MySQL 8 도커 (호스트 포트 **3307** — 로컬 mysqld가 3306 점유 중이라 옮김. DB명 `scheduler`, root 비번 `scheduler123`)

## 실행 (도커 전체)

```bash
docker compose up -d --build
```

- 프론트: http://localhost:5003
- 백엔드 API: http://localhost:5004/api

## 실행 (로컬 개발)

```bash
# 1. DB만 도커로
docker compose up -d mysql

# 2. 백엔드
cd backend && npm install && npm run start:dev

# 3. 프론트
cd frontend && npm install && npm run dev
```

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/auth/register` | 회원가입 `{email, password, name}` |
| POST | `/api/auth/login` | 로그인 → `{accessToken, user}` |
| GET | `/api/auth/me` | 내 정보 (Bearer 토큰) |
| GET | `/api/tasks?date=YYYY-MM-DD` | 해당 날짜 할일 목록 |
| POST | `/api/tasks` | 할일 추가 `{title, date, category?}` |
| PATCH | `/api/tasks/:id` | 수정 (completed, top3Order, startTime/endTime 등) |
| DELETE | `/api/tasks/:id` | 삭제 (soft delete) |

## 설계 메모

- 삭제는 전부 **soft delete** (`deletedAt` 컬럼, TypeORM `@DeleteDateColumn`)
- 인증은 이메일/비번 + JWT (7일 만료). Redis 불필요. 구글 OAuth는 추후 추가 예정
- `tasks.top3Order`(1~3)로 Today's Top 3, `startTime`/`endTime`으로 타임박싱 지원 — 스키마는 이미 준비됨
