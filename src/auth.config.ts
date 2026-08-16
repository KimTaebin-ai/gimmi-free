import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// adapter 없는 edge-safe 설정. proxy.ts와 auth.ts가 공유한다.
// JWT 세션 전략이므로 요청마다 DB를 조회하지 않는다.
export const authConfig = {
  // Vercel 밖(로컬 prod, Docker self-host)에서도 동작하도록. 단일 사용자 앱이라 안전.
  trustHost: true,
  providers: [
    Google({
      // refresh_token은 최초 동의 시에만 발급되므로 offline + consent 필수
      authorization: {
        params: { access_type: "offline", prompt: "consent" },
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
