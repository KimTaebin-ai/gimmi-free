import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// 이 파일은 Prisma CLI(migrate/generate/studio)만 읽는다.
// 앱 런타임은 src/lib/prisma.ts에서 DATABASE_URL(pooled)로 직접 연결한다.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Supabase transaction pooler(6543)에서는 schema engine이 행이 걸리므로
    // CLI는 항상 세션/직접 연결(DIRECT_URL, 5432)을 쓴다.
    url: env("DIRECT_URL"),
  },
});
