import GitHub from "@auth/core/providers/github";
import type { AuthConfig } from "@auth/core/types";
import type { CloudflareEnv } from "./src/lib/cloudflare";

export function createAuthConfig(env: CloudflareEnv): AuthConfig {
  return {
    basePath: "/api/auth",
    secret: env.AUTH_SECRET,
    trustHost: true,
    session: { strategy: "jwt" },
    providers: [GitHub({
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      profile(profile) {
        return {
          id: String(profile.id),
          name: profile.name || profile.login,
          email: profile.email,
          image: profile.avatar_url,
        };
      },
    })],
    callbacks: {
      jwt({ token, profile }) {
        if (profile) {
          token.githubId = String(profile.id);
          token.githubUsername = profile.login as string;
        }
        return token;
      },
      session({ session, token }) {
        if (session.user && token.githubId) {
          Object.assign(session.user, {
            id: token.githubId,
            username: token.githubUsername,
          });
        }
        return session;
      },
    },
  };
}
