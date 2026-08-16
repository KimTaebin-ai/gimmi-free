import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

// Prisma adapter는 JWT 전략에서도 User/Account(OAuth 토큰)를 영속화한다.
// Google refresh_token은 Account 테이블에 저장되어 Phase 2(Calendar)/5(Gmail)에서 사용.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
});
