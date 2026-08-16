import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Phase 2: Calendar 읽기/쓰기 추가. Gmail scope는 Phase 5에서.
 * scope를 늘린 뒤에는 재로그인(재동의)해야 새 토큰에 반영된다.
 */
export const GOOGLE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/calendar",
];

// adapter 없는 edge-safe 설정. proxy.ts와 auth.ts가 공유한다.
// JWT 세션 전략이므로 요청마다 DB를 조회하지 않는다.
export const authConfig = {
  // Vercel 밖(로컬 prod, Docker self-host)에서도 동작하도록. 단일 사용자 앱이라 안전.
  trustHost: true,
  providers: [
    Google({
      // refresh_token은 최초 동의 시에만 발급되므로 offline + consent 필수
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
          scope: GOOGLE_SCOPES.join(" "),
        },
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    signIn({ user }) {
      const email = user.email?.toLowerCase();
      return !!email && allowedEmails.includes(email);
    },
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
