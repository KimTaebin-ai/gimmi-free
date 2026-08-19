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
    timezone.ts             # ★ 날짜/시간 단일 기준. 시각(instant) vs 떠 있는 날짜(종일) 구분
    calendar-utils.ts       # [startAt, endAt) 반열린 구간 + 종일=UTC 자정 규칙
    date-only.ts            # @db.Date 컬럼용. 날짜만 있는 값은 "yyyy-MM-dd"로 주고받고 UTC 자정 저장
    fitness-stats.ts        # 1RM(Epley)·볼륨·부위별 집계·이동평균 (순수 함수, 테스트 대상)
    growth-evidence.ts      # 성장 근거의 형태·세기 판정(순수 함수). growth.ts가 이걸 쓴다
    settings.ts             # User.settings(JSON) 읽기/쓰기
    google/
      tokens.ts             # access token 획득 + refresh(만료 시 Account 갱신)
      calendar.ts           # Calendar REST 클라이언트(fetch 기반, googleapis 미사용)
      sync.ts               # Google → 로컬 캐시 pull(syncToken 증분, 410 시 전체 폴백)
      task-push.ts          # 시간 지정 태스크 → Google 이벤트 push(best-effort)
    naver/
      crawl.ts              # 모바일 블로그 목록 API 파서(순수 함수, 실제 응답 픽스처로 테스트)
      post-body.ts          # 모바일 글 페이지 → 블록 배열(문단/이미지/인용/링크). 순수 함수
      sync.ts               # 목록 크롤링 → BlogPost upsert → 본문 수집 → RAG 색인
    rag/
      chunk.ts              # 본문 → 청크(문단 경계, 겹침, 청크마다 글 제목). 순수 함수
      voyage.ts             # Voyage 임베딩 클라이언트(키 없으면 null — RAG만 꺼진다)
      index-blog.ts         # 청크 임베딩 → DocChunk 저장(pgvector라 raw SQL)
      search.ts             # 코사인 최근접 검색(searchByVector는 임베딩 없이 테스트 가능)
      retrieval-plan.ts     # 성장 요약이 무엇으로 검색할지(탐침 만들기·결과 병합). 순수 함수
  hooks/                    # use-tasks, use-calendar, use-media-query
  components/
    tasks/                  # tasks-view(3-pane 오케스트레이터), task-list/item/detail, quick-add, sidebar
    calendar/               # calendar-view(월/주/일/목록 전환), month/time-grid/agenda, item-detail
  app/api/cron/calendar-sync/ # Vercel Cron 15분 주기 pull (vercel.json)
```

## 데이터 모델 (prisma/schema.prisma가 진실. 요약)

- **User / Account / Session** — Auth.js 표준. `Account`에 Google `access_token`/`refresh_token`/`expires_at`/`scope` 저장.
- **TaskEntry** — 기록(`kind`: note|script|reflection|link). **태스크와 Google 일정 양쪽**에 붙는다.
  일정 쪽은 로컬 `CalendarEvent` 행이 아니라 `(userId, googleEventId)`에 매단다 —
  동기화 창을 벗어나 캐시가 정리돼도 사용자가 쓴 메모는 남아야 하기 때문.
  성장 요약의 핵심 근거이며, 에이전트는 태스크와 일정의 기록을 **동등하게** 읽는다.
- **GrowthSummary** — 홈 화면 성장 요약 캐시(LLM 결과). 사용자가 명시적으로 요청할 때만 생성.
- **Project**(리스트), **Tag**, **Task**(priority 0-3, status, startAt/dueAt, `rrule`, parentId 서브태스크,
  `googleEventId`, sortOrder), **TaskTag**
- **CalendarEvent** — Google 이벤트 캐시(`googleEventId`, `source: google|task`, `lastSyncedAt`)
- **Exercise** — 사용자별 종목 사전(`muscleGroup`으로 부위별 볼륨 집계). 기록은 이름으로 남으므로
  사전을 지워도 과거 기록은 보존된다.
- **WorkoutRoutine / RoutineExercise / Workout / WorkoutSet**(`exerciseOrder`로 종목 순서 유지)
- **BodyMetric** — 날짜별 체중/골격근량/체지방률
- **Food / Meal / MealItem** — 끼니(type: breakfast|lunch|dinner|snack) + 매크로
- **BlogPost** — 네이버 블로그에서 불러온 글. `(userId, logNo)`가 중복 판별 키.
  본문은 저장하지 않고 원문 링크로 연결한다.

## 환경변수 (.env — 커밋 금지, .env.example 참고)

- `DATABASE_URL` — Postgres 연결 문자열
- `AUTH_SECRET` — `npx auth secret`으로 생성
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — Google Cloud OAuth 클라이언트
- `ALLOWED_EMAILS` — 로그인 허용 이메일(콤마 구분). 화이트리스트 밖 계정은 로그인 거부.
- `ANTHROPIC_API_KEY` — 홈 화면 성장 요약용. 없으면 앱은 정상 동작하고 그 화면만 안내를 띄운다.
- `NAVER_BLOG_ID` — 네이버 블로그 아이디. 공개 목록만 읽으므로 인증 불필요.
- `VOYAGE_API_KEY` — 블로그 본문 RAG 검색용 임베딩. Anthropic은 임베딩 API가 없어서 Voyage를 쓴다.
  없으면 블로그 읽기·저장은 그대로 되고 성장 요약에서 본문 발췌만 빠진다.
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
- **날짜/시간 (해외 사용 포함) — `src/lib/timezone.ts`가 단일 기준.**
  - **시각(instant)**: 시간이 지정된 태스크/일정. UTC로 저장하고 볼 때 현재 위치 타임존으로 렌더링.
    서울에서 만든 오후 3시는 뉴욕에서 오전 2시로 보이는 게 맞다.
  - **떠 있는 날짜(floating date)**: 종일 태스크/일정. "8월 20일"은 어디서 보든 8월 20일이어야 하므로
    **UTC 자정**으로 저장하고 UTC 연·월·일로 읽는다(Google의 `date: "2026-08-20"`과 같은 개념).
  - 종일 값을 로컬 자정으로 저장하면 타임존이 바뀔 때 하루가 밀린다. 생성은 `toFloatingDate()`,
    표시·비교는 `forDisplay()`를 반드시 경유할 것.
  - 스마트 리스트 필터는 종일/시간지정을 **각자의 기준으로** 비교한다(한 기준으로 묶으면
    UTC 오프셋이 음수인 지역에서 하루 어긋남). `TaskFilter`의 `DateWindow` 참고.
  - 브라우저 타임존은 `TimeZoneSync`가 `User.timezone`에 반영(서버 계산용). 화면은 브라우저
    타임존을 직접 쓰므로 이동 즉시 반영된다.
- **홈(`/`)은 성장 대시보드**다. 제품의 관점: 노력 = 시간을 쏟거나 일을 끝낸 게 아니라
  **이전에 할 수 없던 걸 할 수 있게 되는 것**. 그래서 완료 목록을 나열하지 않고,
  기록에서 근거를 찾아 "새로 할 수 있게 된 것"만 추린다. 근거가 없으면 비워 두고,
  반복 업무는 솔직하게 "성장으로 이어지지 않은 일"로 분류한다.
  근거는 **태스크 + Google 일정 + 블로그 글 + 각각에 붙은 기록** 전부다.
  (수업·세미나는 대개 일정으로 들어오고, 블로그 글은 "그 주제를 설명할 수 있게 됐다"는 신호다.)
  근거의 세기는 `growth-evidence.ts`의 `evidenceStrength`로 매겨 강한 것부터 프롬프트에 넣고,
  제목만 있는 항목은 "근거가 약함"으로 표시해 모델이 단정하지 않게 한다.
- LLM 호출은 **사용자가 버튼을 누를 때만** 한다(화면 로딩만으로 과금되지 않도록).
  결과는 `GrowthSummary`에 캐시. 모델/프롬프트는 `src/lib/growth.ts`.
- Claude API를 쓸 때는 `claude-api` 스킬을 먼저 읽을 것(모델 ID·파라미터가 자주 바뀐다).
  현재: `claude-opus-5`, 구조화 출력은 `output_config.format` + `zodOutputFormat`,
  `temperature`/`budget_tokens`는 400. `stop_reason: "refusal"`을 먼저 확인할 것.
- 차트: 색은 `globals.css`의 `--chart-*` CSS 변수로만 지정(테마 전환이 자동으로 따라감).
  팔레트는 검증된 카테고리 슬롯 1~3이며 라이트/다크 모두 CVD 검사를 통과한 값이다.
  **이중 축(y축 2개) 금지** — 단위가 다르면 차트를 나눈다(예: 체중·골격근량 kg / 체지방률 %).
- **색의 의미는 화면마다 다르다. 섞지 말 것.**
  - **목록(태스크 페이지·오늘)**: 색 = *식별*. 표시 순서대로 8색(`--task-*`)을 돌려 써
    이웃 행이 항상 다른 색이 되게 한다. 우선순위는 제목 앞 깃발 아이콘.
  - **캘린더**: 색 = *우선순위*(`--priority-*`). 캘린더는 "지금 뭐가 급한가"를 훑는
    화면이라 우선순위를 색으로 쓰는 편이 읽기 쉽다. 왼쪽 3px 띠가 그 역할을 하고,
    깃발 아이콘은 중복이므로 캘린더에서는 쓰지 않는다.
    하루짜리 항목은 **배경 없이 띠만** — 화면이 색으로 뒤덮이지 않게. 여러 날/종일
    항목만 옅은 배경(14%)을 깔아 구간이 이어지는 걸 보여준다.
  - **시간이 정해진 Google 일정은 우선순위 '높음'으로 취급**한다(반드시 지켜야 할 약속).
    종일 일정은 시각 구속이 없어 우선순위 없음. `effectivePriority()` 참고.
  - Google 일정을 흐리게 처리하지 말 것 — 사용자에게 중요한 정보다.
    종류 구분(내 태스크 vs 외부 일정)은 캘린더 아이콘이 맡는다.
  - 우선순위 색은 validate_palette로 라이트/다크 both all-pairs 통과를 확인했다.
    다크에서 기본 red(#e66767)는 amber와 ΔE 13으로 실패해 #d94a6a로 옮겼다 — 바꾸지 말 것.

## 네이버 블로그 주의사항

- 네이버에는 **내 글 목록을 주는 공식 read API가 없다.** 로그인 오픈API는 *쓰기*만 있고,
  검색 API는 키워드 기반이라 전량 보장이 안 된다.
- **RSS는 폐기했다.** `https://rss.blog.naver.com/{blogId}.xml`이 채널 제목·링크까지 전부
  빈 값인 껍데기 XML을 돌려준다(HTTP 200 + item 0개). 블로그 RSS 설정과 무관한 네이버 쪽
  문제라 우리가 손쓸 수 없다. 되살리지 말 것.
- **지금 경로: 모바일 블로그 목록 API 크롤링**(`src/lib/naver/crawl.ts`).
  - `https://m.blog.naver.com/api/blogs/{blogId}/post-list?categoryNo=0&itemCount=30&page=N`
  - ⚠️ **Referer가 없으면 403**이다(UA는 아무 값이나 통과). 그래서 브라우저인 척하지 않고
    정직한 UA + `https://m.blog.naver.com/{blogId}` Referer를 보낸다.
  - `itemCount`는 30까지. 100은 거절당한다. 빈 페이지가 올 때까지 걸으면 **전체 글**을 받는다
    (RSS는 최근 글만 줬다). 안전장치로 20페이지에서 멈춘다.
  - `addDate`가 epoch ms라 날짜뿐이던 RSS `pubDate`보다 정확하고, 카테고리 *이름*과
    썸네일 주소가 그대로 들어 있다. 대신 **태그는 주지 않는다** — 그래서 upsert 때
    `tags`를 덮어쓰지 않는다(빈 배열로 밀면 예전에 받아 둔 태그가 지워진다).
  - 응답이 `isSuccess: false`인 경우는 "글 0개"와 반드시 구분할 것. 안 그러면 잘못된
    블로그 아이디가 "글이 없네요"로 보인다.
- **본문은 모바일 글 페이지에서 읽는다**(`post-body.ts`). PC의 `PostView.naver`는 본문이
  iframe 안이라 취약하지만 `m.blog.naver.com/{blogId}/{logNo}`는 본문을 그대로 담고 있다.
  - 대상은 **내 블로그, 내 글**뿐이다(단일 사용자 앱 + `NAVER_BLOG_ID`). 남의 블로그를
    긁는 용도로 넓히지 말 것.
  - **HTML을 그대로 렌더하지 않는다.** SmartEditor ONE(`se-main-container`)의 컴포넌트를
    우리 블록 배열(문단/제목/인용/이미지/링크/구분선)로 환원해 `BlogPost.contentBlocks`에
    저장하고, 리더가 우리 컴포넌트로 그린다 — XSS도 막고 다크모드도 따라온다.
  - 본문은 **없는 글만** 받는다(`bodyFetchedAt`이 null). 글마다 요청이 하나씩 나가므로
    목록처럼 매번 전량을 훑지 않는다. 한 번에 30개까지, 나머지는 다음 동기화에서.
  - 본문 파싱에 실패하면 빈 값으로 덮지 말 것 — 다음 동기화에서 다시 시도하게 둔다.
- 파서는 필드 누락에 방어적으로, 그리고 **순수 함수로**(네트워크는 `sync.ts`가 맡는다).
  실제 응답 픽스처(`__fixtures__/naver-post-list*.json`)로 테스트한다.

## RAG (블로그 본문 검색)

- 목적은 하나다: **성장 요약이 글 제목·요약이 아니라 본문을 근거로 삼게 하는 것.**
  "그 주제를 설명할 수 있게 됐다"는 판단은 본인이 쓴 문장에서 나와야 한다.
- 저장소는 **Supabase Postgres + pgvector**, 임베딩은 **Voyage `voyage-4` / 1024차원**.
  Anthropic은 임베딩 API를 제공하지 않아서 이 부분만 외부 제공자를 쓴다.
- `DocChunk.embedding`은 Prisma가 다루지 못하는 타입이라 **읽기/쓰기 모두 raw SQL**이다
  (`index-blog.ts`, `search.ts`). id도 DB 기본값이 안 먹으므로 직접 만든다.
- **HNSW 인덱스는 일부러 안 깐다.** Prisma 스키마 언어로 표현할 수 없어서 상시 드리프트가
  되고, `migrate dev`가 매번 지울지 물어본다. 지금 규모(청크 수백 개)에선 전수 탐색이
  1ms도 안 걸린다. 십만 단위가 되면 그때 raw SQL로 깔고 드리프트를 감수할 것.
- 청킹은 **문단 경계 + 겹침 150자 + 청크마다 글 제목 머리말**. 제목을 붙이는 이유는
  검색 결과가 청크 하나만 프롬프트에 실리기 때문이다(맥락 없이 뜬 문단이 되면 안 된다).
- 성장 요약에는 사용자가 입력하는 질문이 없다. 그래서 검색어를 만들어 쓴다 —
  고정 탐침 4개 + **그 기간에 실제로 한 일(태스크·일정 제목)** 최대 6개.
  블로그 글 제목은 탐침에서 뺀다(그 글 자신만 다시 올라와 새 근거가 되지 않는다).
- 임베딩 호출은 **사용자가 "정리해 줘"를 누를 때만** 일어난다(화면 로딩엔 없음).
  Claude 호출 규칙과 같은 이유다.
- 키가 없거나 검색이 실패하면 **조용히 발췌 없이** 요약을 만든다. RAG는 곁들이지 전제가 아니다.

## 로컬 개발

```bash
docker compose up -d      # 로컬 Postgres (포트 5432)
npm install
npx prisma migrate dev    # 스키마 반영
npm run dev               # http://localhost:3000
```
