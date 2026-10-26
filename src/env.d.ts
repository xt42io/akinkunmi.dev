/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly NOW_PLAYING_TOKEN?: string;
  readonly REDIS_URL?: string;
  readonly WEBSITE_ORIGIN?: string;
  readonly CORS_ORIGINS?: string;
}
