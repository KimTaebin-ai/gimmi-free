<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
# Personal Life Hub

개인용(single-user, private) 라이프 관리 웹앱. TickTick을 벤치마크로 한 태스크 관리 +
Google Calendar/Gmail 연동 + 운동/체성분/식단 트래킹. 사용자는 소유자 1명뿐이며
Google 계정으로만 로그인한다(이메일 화이트리스트).

## 스택

- **Next.js (App Router) + TypeScript** — Server Actions 사용, 모바일/PC 완전 반응형 + PWA(Phase 6)
- **Tailwind CSS + shadcn/ui** — 컴포넌트는 `src/components/ui`(shadcn 생성물) / `src/components`(앱 컴포넌트)
- **Prisma + PostgreSQL** — 모든 DB 접근은 Prisma 경유. `DATABASE_URL`만 바꾸면 어디서든 동작(host-agnostic).
  로컬 개발은 `docker compose up -d`의 Postgres, 배포는 Supabase/Neon 매니지드 Postgres.
- **Auth.js (NextAuth v5) + Google Provider** — JWT 세션 전략 + Prisma Adapter(Account에 OAuth 토큰 영속화)
- **TanStack Query** — 클라이언트 캐싱/낙관적 업데이트(태스크 체크 UX 핵심)
- **Recharts**(차트), **date-fns**(날짜), **rrule**(반복 규칙), **chrono-node**(자연어 날짜 파싱)
- 배포: GitHub → **Vercel** 자동 배포. GitHub Pages는 정적 전용이라 불가(서버 필수).

## 폴더 구조

```
prisma/schema.prisma        # 데이터 모델 단일 소스
src/
  app/
    login/                  # 비로그인 진입점
    (app)/                  # 인증 필수 그룹: today, tasks, calendar, fitness, diet, mail, settings
    api/auth/[...nextauth]/ # Auth.js 핸들러
  auth.ts                   # NextAuth 인스턴스(auth.config + Prisma adapter, 토큰 저장)
  auth.config.ts            # adapter 없는 공유 설정(Google provider, 화이트리스트, JWT 콜백)
  proxy.ts                  # Next 16 프록시(구 middleware): 비로그인 → /login 리다이렉트
                            # JWT 세션 전략이라 프록시에서 DB 접근 없음(쿠키만 검사)
  lib/
    prisma.ts               # PrismaClient 싱글턴
    actions/                # "use server" 서버 액션 (tasks, projects, tags …)
    quick-add.ts            # 퀵애드 자연어 파서(한국어 날짜/시간, #태그, !우선순위, 반복)
    smart-lists.ts          # 스마트 리스트 → TaskFilter 변환(날짜는 클라 타임존 기준)
    calendar-utils.ts       # [startAt, endAt) 반열린 구간 + 종일=UTC 자정 규칙
    date-only.ts            # @db.Date 컬럼용. 날짜만 있는 값은 "yyyy-MM-dd"로 주고받고 UTC 자정 저장
    fitness-stats.ts        # 1RM(Epley)·볼륨·부위별 집계·이동평균 (순수 함수, 테스트 대상)
    settings.ts             # User.settings(JSON) 읽기/쓰기
    google/
      tokens.ts             # access token 획득 + refresh(만료 시 Account 갱신)
      calendar.ts           # Calendar REST 클라이언트(fetch 기반, googleapis 미사용)
      sync.ts               # Google → 로컬 캐시 pull(syncToken 증분, 410 시 전체 폴백)
      task-push.ts          # 시간 지정 태스크 → Google 이벤트 push(best-effort)
  hooks/                    # use-tasks, use-calendar, use-media-query
  components/
    tasks/                  # tasks-view(3-pane 오케스트레이터), task-list/item/detail, quick-add, sidebar
    calendar/               # calendar-view(월/주/일/목록 전환), month/time-grid/agenda, item-detail
  app/api/cron/calendar-sync/ # Vercel Cron 15분 주기 pull (vercel.json)
```

## 데이터 모델 (prisma/schema.prisma가 진실. 요약)

- **User / Account / Session** — Auth.js 표준. `Account`에 Google `access_token`/`refresh_token`/`expires_at`/`scope` 저장.
- **Project**(리스트), **Tag**, **Task**(priority 0-3, status, startAt/dueAt, `rrule`, parentId 서브태스크,
  `googleEventId`, sortOrder), **TaskTag**
- **CalendarEvent** — Google 이벤트 캐시(`googleEventId`, `source: google|task`, `lastSyncedAt`)
- **Exercise** — 사용자별 종목 사전(`muscleGroup`으로 부위별 볼륨 집계). 기록은 이름으로 남으므로
  사전을 지워도 과거 기록은 보존된다.
- **WorkoutRoutine / RoutineExercise / Workout / WorkoutSet**(`exerciseOrder`로 종목 순서 유지)
- **BodyMetric** — 날짜별 체중/골격근량/체지방률
- **Food / Meal / MealItem** — 끼니(type: breakfast|lunch|dinner|snack) + 매크로

## 환경변수 (.env — 커밋 금지, .env.example 참고)

- `DATABASE_URL` — Postgres 연결 문자열
- `AUTH_SECRET` — `npx auth secret`으로 생성
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — Google Cloud OAuth 클라이언트
- `ALLOWED_EMAILS` — 로그인 허용 이메일(콤마 구분). 화이트리스트 밖 계정은 로그인 거부.
- `AUTH_URL` — 배포 시 프로덕션 URL(Vercel에선 보통 자동 감지)

## Google OAuth 주의사항

- Gmail은 **restricted**, Calendar는 **sensitive** scope → OAuth 동의화면을 **Testing** 상태로 두고
  본인 계정을 test user로 등록해 검증 없이 사용. Testing 모드는 refresh token이 7일 만료될 수 있음.
- refresh_token은 **최초 동의 시에만** 발급 → 반드시 `access_type=offline` + `prompt=consent`.
- scope는 `src/auth.config.ts`의 `GOOGLE_SCOPES` 한 곳에서 관리. Phase 2에서 `auth/calendar` 추가됨
  (Gmail은 Phase 5). **scope를 늘리면 재로그인(재동의)해야 새 토큰에 반영**된다.
  Cloud Console에서 Calendar API/Gmail API 각각 Enable 필요.
- 동기화 충돌은 last-write-wins + `lastSyncedAt` 비교. Google발 이벤트는 앱에서 읽기 전용(기본값).
- 캘린더 동기화 방향:
  - **pull**: Google → `CalendarEvent` 캐시. `CalendarSyncState.syncToken`으로 증분, 410이면 전체 재동기화.
  - **push**: `allDay=false`인 미완료 태스크만 Google 이벤트로. 종일 태스크는 캘린더를 덮으므로 제외.
    설정(`syncTasksToCalendar`)으로 끌 수 있고, 실패해도 태스크 저장은 성공하도록 `after()` + try/catch.
  - 태스크가 만든 이벤트는 pull 때 `Task.googleEventId`로 걸러 중복 저장하지 않는다.

## 개발 규칙

- 커밋은 기능 단위로 잘게, **conventional commits**(`feat:`, `fix:`, `chore:`, `docs:` …).
- 시크릿/토큰 절대 커밋 금지. 새 env가 생기면 `.env.example`에 즉시 반영.
- 각 Phase는 "동작하는 수직 슬라이스"로 완성 후 다음 단계로:
  P0 스캐폴딩+로그인+DB+배포 → P1 태스크 코어 → P2 캘린더 → P3 피트니스 → P4 식단 → P5 메일 → P6 PWA/대시보드/폴리시
- 스키마 변경은 `npx prisma migrate dev --name <설명>`으로 마이그레이션 생성(스키마 직접 push 금지).
- 모바일: 하단 탭바 5개(오늘/캘린더/피트니스/식단/더보기). PC: 3-pane(사이드바+메인+상세). 다크모드 지원.
- 낙관적 UI: 태스크 완료 체크 등은 서버 응답 전 즉시 반영(TanStack Query mutation).
- 차트: 색은 `globals.css`의 `--chart-*` CSS 변수로만 지정(테마 전환이 자동으로 따라감).
  팔레트는 검증된 카테고리 슬롯 1~3이며 라이트/다크 모두 CVD 검사를 통과한 값이다.
  **이중 축(y축 2개) 금지** — 단위가 다르면 차트를 나눈다(예: 체중·골격근량 kg / 체지방률 %).

## 로컬 개발

```bash
docker compose up -d      # 로컬 Postgres (포트 5432)
npm install
npx prisma migrate dev    # 스키마 반영
npm run dev               # http://localhost:3000
```
