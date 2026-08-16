# Personal Life Hub

개인용(single-user) 라이프 관리 웹앱 — 태스크(TickTick 스타일) · Google Calendar/Gmail 연동 ·
운동 루틴 · 체성분 · 식단 트래킹. Next.js + Prisma + Postgres + Auth.js(Google).

## 로컬 개발

```bash
docker compose up -d        # 로컬 Postgres
cp .env.example .env        # 값 채우기 (아래 참고)
npm install
npx prisma migrate dev
npm run dev                 # http://localhost:3000
```

## 환경변수 (.env)

| 변수 | 설명 |
|---|---|
| `DATABASE_URL` | Postgres 연결 문자열 (로컬은 .env.example 값 그대로) |
| `AUTH_SECRET` | `npx auth secret` 또는 `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth 클라이언트 (아래 설정 참고) |
| `ALLOWED_EMAILS` | 로그인 허용 이메일(콤마 구분) — 이 목록 밖 계정은 거부 |

## Google OAuth 설정 (1회)

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트 생성.
2. **APIs & Services → OAuth consent screen**: External + **Testing** 상태, 본인 Gmail을 Test user로 추가.
3. **Credentials → Create OAuth client ID → Web application**:
   - Authorized redirect URIs에 `http://localhost:3000/api/auth/callback/google`
     (배포 후 `https://<도메인>/api/auth/callback/google` 추가)
4. 발급된 Client ID/Secret을 `.env`에 입력.
5. (Phase 2/5에서) Calendar API, Gmail API를 각각 Enable.

## Vercel 배포

1. GitHub에 push 후 Vercel에서 리포 Import.
2. Supabase/Neon에서 Postgres 생성 → `DATABASE_URL`을 Vercel 환경변수로.
3. `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ALLOWED_EMAILS`도 환경변수로 추가.
4. 배포 URL의 콜백 주소를 Google OAuth 클라이언트 redirect URI에 추가.
5. 스키마 반영: 로컬에서 `DATABASE_URL=<프로덕션 URL> npx prisma migrate deploy`.

빌드 시 `postinstall: prisma generate`가 자동 실행됩니다.
