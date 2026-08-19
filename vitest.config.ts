import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // 서버 전용 모듈("server-only" import가 붙은 것)도 테스트에서 불러올 수 있게.
      // 이 패키지가 react-server 조건에 대비해 두고 있는 빈 모듈을 그대로 쓴다.
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
});
