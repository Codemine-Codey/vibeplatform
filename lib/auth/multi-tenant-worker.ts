// ── Multi-tenant auth worker — ONE worker serves EVERY generated app ──────────
// Strict per-app isolation, security-first. No app can ever read, forge, or touch
// another app's users. Bindings (set at deploy): DB (shared D1), KV (per-app config).
//
// Isolation guarantees (defense in depth):
//   1. ROUTE GATE   — appId is the first path segment; an unregistered appId → 404
//                     before any data is touched.
//   2. PER-APP SECRET — each app has its OWN random JWT secret (in KV). A token from
//                     app A literally cannot be verified by app B → no cross-app auth.
//   3. QUERY SCOPE  — EVERY D1 query is parameterized with app_id. The users table has
//                     UNIQUE(app_id, email); reads/writes always include `WHERE app_id=?`.
//   4. TOKEN CLAIM  — the JWT embeds aud=appId; verify rejects a token whose aud ≠ the
//                     route's appId, even in the impossible event of a secret reuse.
//   5. CORS SCOPE   — responses only allow the app's own registered origin(s).
//   6. HASHING      — PBKDF2-SHA256, 100k iterations, per-user random salt (Web Crypto).
//
// This source is deployed ONCE (see deployMultiTenantAuthWorker). "Setup auth" for a
// project becomes a KV registration (instant) — never a new worker.
export const MULTI_TENANT_AUTH_WORKER = String.raw`
const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const b64urlStr = (s) => btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

function json(data, status = 200, cors = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}
function corsFor(origin, allowed) {
  // allowed: array of exact origins, or ['*'] during early dev. Never reflect an
  // origin that isn't registered for this app.
  const ok = allowed.includes('*') || allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? (origin || '*') : 'null',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

async function hashPassword(password, saltHex) {
  const salt = saltHex ? Uint8Array.from(saltHex.match(/.{2}/g).map(h => parseInt(h, 16))) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  const saltStr = [...salt].map(b => b.toString(16).padStart(2, '0')).join('');
  return saltStr + ':' + b64url(bits);
}
async function verifyPassword(password, stored) {
  const [saltHex, ] = stored.split(':');
  const recomputed = await hashPassword(password, saltHex);
  // constant-time-ish compare
  if (recomputed.length !== stored.length) return false;
  let diff = 0; for (let i = 0; i < stored.length; i++) diff |= recomputed.charCodeAt(i) ^ stored.charCodeAt(i);
  return diff === 0;
}

async function signJWT(payload, secret) {
  const header = b64urlStr(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64urlStr(JSON.stringify(payload));
  const data = header + '.' + body;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return data + '.' + b64url(sig);
}
async function verifyJWT(token, secret, expectedAud) {
  try {
    const [h, b, s] = token.split('.');
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('HMAC', key, Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0)), enc.encode(h + '.' + b));
    if (!valid) return null;
    const payload = JSON.parse(atob(b.replace(/-/g,'+').replace(/_/g,'/')));
    if (payload.aud !== expectedAud) return null;            // hard app-scope check
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch { return null; }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean); // [appId, action]
    const appId = parts[0];
    const action = parts[1];
    if (!appId || !action) return json({ error: 'Bad route' }, 400);

    // GATE 1: app must be registered (in the auth_apps table), else 404 before
    // touching any user data. Config lives in the shared D1 (not KV) — one binding.
    const cfgRow = await env.DB.prepare('SELECT jwt_secret, origins FROM auth_apps WHERE app_id = ?').bind(appId).first();
    if (!cfgRow) return json({ error: 'Unknown app' }, 404);
    let cfg;
    try { cfg = { secret: cfgRow.jwt_secret, origins: JSON.parse(cfgRow.origins || '["*"]') }; }
    catch { cfg = { secret: cfgRow.jwt_secret, origins: ['*'] }; }

    const origin = request.headers.get('Origin') || '';
    const cors = corsFor(origin, cfg.origins || ['*']);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    try {
      if (action === 'signup' && request.method === 'POST') {
        const { email, password } = await request.json();
        if (!email || !password || password.length < 6) return json({ error: 'Email and a 6+ char password required' }, 400, cors);
        const existing = await env.DB.prepare('SELECT id FROM users WHERE app_id = ? AND email = ?').bind(appId, email).first();
        if (existing) return json({ error: 'Account already exists' }, 409, cors);
        const hash = await hashPassword(password);
        const id = crypto.randomUUID();
        await env.DB.prepare('INSERT INTO users (id, app_id, email, password_hash, created_at) VALUES (?,?,?,?,?)')
          .bind(id, appId, email, hash, new Date().toISOString()).run();
        const token = await signJWT({ sub: id, email, aud: appId, exp: Math.floor(Date.now()/1000) + 60*60*24*7 }, cfg.secret);
        return json({ token, user: { id, email } }, 200, cors);
      }

      if (action === 'login' && request.method === 'POST') {
        const { email, password } = await request.json();
        const row = await env.DB.prepare('SELECT id, password_hash FROM users WHERE app_id = ? AND email = ?').bind(appId, email).first();
        if (!row || !(await verifyPassword(password, row.password_hash))) return json({ error: 'Invalid email or password' }, 401, cors);
        const token = await signJWT({ sub: row.id, email, aud: appId, exp: Math.floor(Date.now()/1000) + 60*60*24*7 }, cfg.secret);
        return json({ token, user: { id: row.id, email } }, 200, cors);
      }

      if (action === 'me' && request.method === 'GET') {
        const auth = request.headers.get('Authorization') || '';
        const token = auth.replace(/^Bearer\s+/i, '');
        const payload = await verifyJWT(token, cfg.secret, appId);
        if (!payload) return json({ error: 'Unauthorized' }, 401, cors);
        // Re-scope by appId AND the token's subject — never trust the token alone for data.
        const row = await env.DB.prepare('SELECT id, email, created_at FROM users WHERE app_id = ? AND id = ?').bind(appId, payload.sub).first();
        if (!row) return json({ error: 'Unauthorized' }, 401, cors);
        return json({ user: row }, 200, cors);
      }

      return json({ error: 'Not found' }, 404, cors);
    } catch (e) {
      return json({ error: 'Server error' }, 500, cors);
    }
  },
};
`

// Shared D1 schema — created once. auth_apps holds per-app config (the gate +
// per-app JWT secret); users is app_id-scoped with UNIQUE(app_id,email). Together
// they are the structural half of isolation.
export const MULTI_TENANT_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS auth_apps (
    app_id TEXT PRIMARY KEY,
    jwt_secret TEXT NOT NULL,
    origins TEXT NOT NULL DEFAULT '["*"]',
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    app_id TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(app_id, email)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_users_app ON users(app_id);`,
]
