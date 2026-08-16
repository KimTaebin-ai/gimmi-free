import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

// Prisma adapter는 JWT 전략에서도 User/Account(OAuth 토큰)를 영속화한다.
// Google refresh_token은 Account 테이블에 저장되어 Phase 2(Calendar)/5(Gmail)에서 사용.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  events: {
    /**
     * Auth.js는 Account가 이미 연결돼 있으면 재로그인 시 linkAccount를 다시 호출하지 않아
     * Account 행의 토큰이 예전 값으로 남는다. scope를 늘린 뒤 재동의해도 DB에는 반영되지
     * 않아 API가 계속 403을 뱉는 원인이 되므로, 로그인할 때마다 직접 갱신한다.
     */
    async signIn({ account }) {
      if (account?.provider !== "google") return;

      await prisma.account.updateMany({
        where: {
          provider: account.provider,
          providerAccountId: account.providerAccountId,
        },
        data: {
          access_token: account.access_token,
          expires_at: account.expires_at,
          scope: account.scope,
          token_type: account.token_type,
          id_token: account.id_token,
          // refresh_token은 동의 화면을 거칠 때만 내려온다. 없으면 기존 값을 유지.
          ...(account.refresh_token ? { refresh_token: account.refresh_token } : {}),
        },
      });
    },
  },
});
