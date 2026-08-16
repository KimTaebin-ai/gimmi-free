import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// adapter 없는 설정으로 초기화 — 쿠키의 JWT만 검사하고 DB는 건드리지 않는다.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname === "/login";

  if (!isLoggedIn && !isLoginPage) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }
  if (isLoggedIn && isLoginPage) {
    return Response.redirect(new URL("/today", req.nextUrl));
  }
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|ico|webmanifest)).*)"],
};
