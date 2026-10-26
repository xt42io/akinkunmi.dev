import { defineConfig } from "astro/config";

import tailwind from "@astrojs/tailwind";
import react from "@astrojs/react";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: cloudflare(),
  integrations: [tailwind(), react()],
  // Auth.js uses encrypted JWT cookies, not Astro's separate session API.
  session: { driver: "memory" },
  vite: {
    server: {
      proxy: {
        "^/api/now-playing(?:\\?.*)?$": {
          target: "https://akinkunmi.dev",
          changeOrigin: true,
          // Preview the live feed; local ingest requests still use local D1.
          bypass(request) {
            if (request.method !== "GET") return request.url;
          },
        },
      },
    },
  },
  server:{
    allowedHosts:['.outray.app']
  }
});
