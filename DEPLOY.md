# 배포 (Vercel)

**운영 URL: <https://gimmi-free-k2g2.vercel.app>** (리전 icn1 / 서울)

GitHub `main`에 push하면 Vercel이 자동 배포한다. 최초 1회만 아래 설정이 필요하다.
아래 1~3번은 이미 완료된 상태이며, 도메인을 바꾸거나 프로젝트를 다시 만들 때 참고한다.

## 1. Vercel에 프로젝트 만들기

1. <https://vercel.com/new> → GitHub 계정 연결 → `KimTaebin-ai/gimmi-free` **Import**
2. Framework는 Next.js로 자동 인식된다. Build/Output 설정은 **건드리지 말 것**
   (`postinstall`의 `prisma generate`가 알아서 돈다).
3. **Deploy 누르기 전에** 아래 2번의 환경변수를 먼저 넣는다. 없으면 빌드는 통과해도
   로그인·DB가 전부 깨진 채 배포된다.

## 2. 환경변수 (Vercel → Settings → Environment Variables)

로컬 `.env`의 값을 그대로 쓴다. Production/Preview/Development 전부 체크.

| 키 | 값 | 비고 |
| --- | --- | --- |
| `DATABASE_URL` | Supabase **pooler** (6543) | 앱 런타임용 |
| `DIRECT_URL` | Supabase **direct** (5432) | Prisma CLI/마이그레이션용 |
| `AUTH_SECRET` | 로컬과 동일 | 바꾸면 기존 세션 전부 로그아웃 |
| `AUTH_GOOGLE_ID` | Google OAuth 클라이언트 ID | |
| `AUTH_GOOGLE_SECRET` | Google OAuth 시크릿 | |
| `ALLOWED_EMAILS` | 로그인 허용 이메일 | 없으면 아무도 못 들어온다 |
| `ANTHROPIC_API_KEY` | 성장 요약용 | 없으면 그 화면만 안내 표시 |
| `NAVER_BLOG_ID` | 네이버 블로그 아이디 | |
| `CRON_SECRET` | 임의의 랜덤 문자열 | **필수** — 아래 참고 |

`AUTH_URL`은 넣지 않아도 된다 (`src/auth.config.ts`에 `trustHost: true`).

### CRON_SECRET을 반드시 넣을 것

`/api/cron/*`은 `CRON_SECRET`이 **없으면 인증 없이 통과**한다. 배포 URL은 공개되므로
누구나 동기화를 트리거할 수 있게 된다. Vercel Cron은 이 값을 `Authorization: Bearer …`로
자동으로 붙여 보내므로, 값만 넣어두면 별도 작업은 없다.

## 3. Google OAuth 리디렉션 URI 추가

Google Cloud Console → 사용자 인증 정보 → OAuth 클라이언트 → **승인된 리디렉션 URI**에 추가:

```
https://<배포도메인>/api/auth/callback/google
```

이걸 빼먹으면 로그인 시 `redirect_uri_mismatch`가 뜬다. 도메인이 바뀌면 다시 추가해야 한다.

동의화면이 **Testing** 상태이므로 본인 계정이 test user로 등록돼 있어야 하고,
refresh token이 7일마다 만료될 수 있다(만료되면 재로그인).

## 4. 데이터베이스

Supabase를 이미 쓰고 있어 마이그레이션은 적용된 상태다. 앞으로 스키마를 바꾸면
**로컬에서** `npx prisma migrate dev`로 마이그레이션을 만들고 push한다.
(빌드 단계에서 `migrate deploy`를 돌리지 않으므로, 마이그레이션은 로컬에서 반영된다.)

## 5. 크론 — Hobby 요금제 제약

Hobby는 **크론이 하루 1회만** 허용된다. 더 자주 도는 표현식은
`Hobby accounts are limited to daily cron jobs` 오류로 **배포가 실패한다.**
그래서 `vercel.json`은 하루 1회로 맞춰 뒀다 (스케줄은 UTC 기준):

- `0 18 * * *` → 캘린더 동기화, 매일 새벽 3시(KST)
- `30 18 * * *` → 블로그 동기화, 매일 새벽 3시 30분(KST)

Hobby는 정확도가 ±59분이라 3:00~3:59 사이에 실행된다. 중간에 최신 데이터가 필요하면
화면의 새로고침 버튼으로 즉시 동기화하면 된다. Pro로 올리면 분 단위로 되돌릴 수 있다.

## 6. 배포 후 확인

1. `https://<도메인>` → `/login`으로 리디렉션되는지
2. Google 로그인 → 화이트리스트 계정으로 통과되는지
3. 캘린더/태스크가 뜨는지 (DB 연결 확인)
4. `curl -s -o /dev/null -w "%{http_code}" https://<도메인>/api/cron/blog-sync` → **401**
   (200이 나오면 `CRON_SECRET`이 안 들어간 것)
