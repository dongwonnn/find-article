import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      // exceljs의 기본 진입점은 node용이라 fs·stream 같은 내장 모듈을 끌고 온다.
      // 엑셀 파일은 브라우저에서만 만들지만, 클라이언트 컴포넌트는 SSR 번들에도
      // 함께 묶여서 그 진입점이 Cloudflare Workers 빌드까지 따라 들어온다.
      // 배포판에 넣는 dist 번들은 외부 require가 하나도 없는 단일 파일이라
      // 어느 런타임으로 묶여도 안전하다.
      exceljs: "exceljs/dist/exceljs.min.js",
    },
  },
};

export default nextConfig;
