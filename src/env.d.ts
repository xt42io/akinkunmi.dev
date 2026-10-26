/// <reference path="../.astro/types.d.ts" />

type CloudflareRuntime = import("@astrojs/cloudflare").Runtime<import("./lib/cloudflare").CloudflareEnv>;

declare namespace App {
  interface Locals extends CloudflareRuntime {}
}
