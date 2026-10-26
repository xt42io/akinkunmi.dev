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
  server:{
    allowedHosts:['.outray.app']
  }
});
