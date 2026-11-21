# The Scheduler

타임박싱 기반 일정 관리 앱. Monthly / Weekly / Daily 페이지로 확장 예정.

## 스택

- **Frontend**: React + Vite (포트 **5003**)
- **Backend**: Kotlin 2.4.21 + Spring Boot 4.2.0 + JPA + JWT (Java 21) (포트 **5004**)
- **DB**: MySQL 8 도커 (호스트 포트 **3307** — 로컬 mysqld가 3306 점유 중이라 옮김. DB명 `scheduler`, root 비번 `scheduler123`)

## 실행 (도커 전체)

```bash
docker compose up -d --build
```

- 프론트: http://localhost:5003
- 백엔드 API: http://localhost:5004/api

프록시가 필요한 Docker 빌더에서는 빌드 인자 `JAVA_TOOL_OPTIONS`에 JVM 프록시 호스트와 포트를 지정할 수 있습니다. 프록시 CA는 BuildKit 시크릿 `gradle_proxy_ca`로 전달할 수 있습니다.

## 실행 (로컬 개발)

```bash
# 1. DB만 도커로
docker compose up -d --wait mysql

# 2. 백엔드
cd backend
DB_HOST=127.0.0.1 DB_PORT=3307 DB_PASSWORD=scheduler123 JWT_SECRET=the-scheduler-jwt-secret-change-me ./gradlew bootRun

# 3. 프론트
cd frontend && npm ci && npm run dev
```

## 기존 TypeORM 데이터베이스 사용

`V1-backend/`에 NestJS 원본이 있습니다. Kotlin 백엔드는 MySQL 8에서 같은 테이블, 컬럼, 사용자 ID, BCrypt 해시와 JWT 설정을 사용합니다. 기존 로그인 토큰을 유지하려면 이전과 같은 `JWT_SECRET`을 지정하세요.

- **새 빈 DB**에서는 Flyway가 첫 실행에 스키마를 생성합니다.
- **기존 DB**에서는 먼저 백업을 만들고 복제본에서 테이블과 컬럼을 [초기 스키마](backend/src/main/resources/db/migration/V1__legacy_schema.sql)와 비교하세요. Kotlin 전환 시에는 NestJS를 종료하고 첫 시작에만 `DB_BASELINE_ON_MIGRATE=true docker compose up -d --build`를 실행하세요. Flyway는 기존 스키마를 버전 1로 기록하고 Hibernate는 매핑을 검증합니다. 로컬 `bootRun`에도 동일한 환경 변수를 줄 수 있습니다. 후속 시작에서는 기본값을 사용하세요.
- Compose는 `scheduler` DB와 `mysql-data` 볼륨을 그대로 사용합니다. 볼륨을 삭제하거나 기존 DB를 초기화할 필요가 없습니다.

`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `PORT`를 설정할 수 있습니다. Compose 밖에서 기본 MySQL 컨테이너에 연결하는 포트는 3307입니다. 개발용 기본 JWT 키는 로컬 테스트용입니다.

## 검증

`cd backend && ./gradlew test bootJar`를 실행하세요. 테스트는 Docker로 별도 MySQL 8을 시작해 레거시 스키마와 MockMvc API를 검증합니다. 프런트엔드는 `cd frontend && npm ci && npm run build`로 빌드합니다.

## API

[전체 레거시 API 계약](docs/kotlin-backend-contract.md)을 참고하세요.

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

- 삭제는 전부 **soft delete** (`deletedAt` 컬럼)
- 인증은 이메일/비번 + JWT (7일 만료). Redis 불필요. 구글 OAuth는 추후 추가 예정
- `tasks.top3Order`(1~3)로 Today's Top 3, `startTime`/`endTime`으로 타임박싱 지원 — 스키마는 이미 준비됨
