/**
 * Better Auth per-project factory.
 * One auth instance per project, cached in module scope so Vercel's function
 * warm pool doesn't create a new Pool on every request.
 */
import { betterAuth } from 'better-auth'
import { bearer } from 'better-auth/plugins'
import { Pool } from '@neondatabase/serverless'

// Use a structural type so the specific generic params don't cause assignability errors
interface AuthInstance {
  handler: (request: Request) => Promise<Response>
  api: Record<string, unknown>
}

const cache = new Map<string, AuthInstance>()

function platformBase(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  return 'https://vibeplatform.vercel.app'
}

export function getAuthInstance(
  projectId: string,
  databaseUrl: string,
  secret: string
): AuthInstance {
  const cached = cache.get(projectId)
  if (cached) return cached

  const instance = betterAuth({
    database: new Pool({ connectionString: databaseUrl }),
    emailAndPassword: { enabled: true },
    secret,
    baseURL: `${platformBase()}/api/proxy/${projectId}/auth`,
    // Bearer plugin: user apps (cross-origin SPAs on CF Pages) can't use cookies
    // set on the Codemine domain. Bearer tokens stored in localStorage work across origins.
    plugins: [bearer()],
    trustedOrigins: ['*'],
  }) as unknown as AuthInstance

  cache.set(projectId, instance)
  return instance
}

// Wipe a cached instance (e.g. after secret rotation or test teardown)
export function evictAuthInstance(projectId: string) {
  cache.delete(projectId)
}

// SQL for the 4 Better Auth core tables — run once on first auth enable.
// IF NOT EXISTS so it's safe to call repeatedly (idempotent).
export const BETTER_AUTH_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS "user" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "name"          TEXT NOT NULL,
  "email"         TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "image"         TEXT,
  "createdAt"     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "session" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "expiresAt"   TIMESTAMP NOT NULL,
  "token"       TEXT NOT NULL UNIQUE,
  "createdAt"   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ipAddress"   TEXT,
  "userAgent"   TEXT,
  "userId"      TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  "id"                     TEXT NOT NULL PRIMARY KEY,
  "accountId"              TEXT NOT NULL,
  "providerId"             TEXT NOT NULL,
  "userId"                 TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "accessToken"            TEXT,
  "refreshToken"           TEXT,
  "idToken"                TEXT,
  "accessTokenExpiresAt"   TIMESTAMP,
  "refreshTokenExpiresAt"  TIMESTAMP,
  "scope"                  TEXT,
  "password"               TEXT,
  "createdAt"              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id"         TEXT NOT NULL PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value"      TEXT NOT NULL,
  "expiresAt"  TIMESTAMP NOT NULL,
  "createdAt"  TIMESTAMP,
  "updatedAt"  TIMESTAMP
);
`
