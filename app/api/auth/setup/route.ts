import { NextResponse } from 'next/server'

export const maxDuration = 60

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID ?? '77da4568eb934dee94fa9fc54faec977'
const CF_API_TOKEN = process.env.CF_API_TOKEN ?? ''
const CF_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}`

const AUTH_WORKER_SCRIPT = `
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 50000, hash: 'SHA-256' },
    key, 256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function signJWT(payload, secret) {
  const enc = new TextEncoder();
  const b64url = s => btoa(s).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=/g,'');
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + 7*24*3600 }));
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(header + '.' + body));
  return header + '.' + body + '.' + b64url(String.fromCharCode(...new Uint8Array(sig)));
}

async function verifyJWT(token, secret) {
  try {
    const [header, body, sig] = token.split('.');
    if (!header || !body || !sig) return null;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sigBytes = Uint8Array.from(atob(sig.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(header + '.' + body));
    if (!valid) return null;
    const payload = JSON.parse(atob(body.replace(/-/g,'+').replace(/_/g,'/')));
    if (payload.exp < Math.floor(Date.now()/1000)) return null;
    return payload;
  } catch { return null; }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/register' && request.method === 'POST') {
        const { email, password, name } = await request.json();
        if (!email || !password) return Response.json({ error: 'Email and password required' }, { status: 400, headers: CORS });
        const maxUsers = parseInt(env.MAX_USERS ?? '0') || 0;
        if (maxUsers > 0) {
          const countRow = await env.DB.prepare('SELECT COUNT(*) as c FROM cm_users').first();
          if (countRow && Number(countRow.c) >= maxUsers) return Response.json({ error: 'This app has reached its user limit.' }, { status: 429, headers: CORS });
        }
        const existing = await env.DB.prepare('SELECT id FROM cm_users WHERE email = ?').bind(email.toLowerCase()).first();
        if (existing) return Response.json({ error: 'Email already registered' }, { status: 409, headers: CORS });
        const salt = crypto.randomUUID();
        const hash = await hashPassword(password, salt);
        const id = crypto.randomUUID();
        await env.DB.prepare('INSERT INTO cm_users (id, email, name, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, email.toLowerCase(), name ?? '', hash, salt, Date.now()).run();
        const token = await signJWT({ sub: id, email: email.toLowerCase() }, env.JWT_SECRET);
        return Response.json({ token, user: { id, email: email.toLowerCase(), name: name ?? '' } }, { headers: CORS });
      }

      if (path === '/login' && request.method === 'POST') {
        const { email, password } = await request.json();
        const user = await env.DB.prepare('SELECT * FROM cm_users WHERE email = ?').bind(email.toLowerCase()).first();
        if (!user) return Response.json({ error: 'Invalid credentials' }, { status: 401, headers: CORS });
        const hash = await hashPassword(String(password), String(user.salt));
        if (hash !== user.password_hash) return Response.json({ error: 'Invalid credentials' }, { status: 401, headers: CORS });
        const token = await signJWT({ sub: user.id, email: user.email }, env.JWT_SECRET);
        return Response.json({ token, user: { id: user.id, email: user.email, name: user.name } }, { headers: CORS });
      }

      if (path === '/me' && request.method === 'GET') {
        const auth = request.headers.get('Authorization');
        if (!auth?.startsWith('Bearer ')) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
        const payload = await verifyJWT(auth.slice(7), env.JWT_SECRET);
        if (!payload) return Response.json({ error: 'Invalid or expired token' }, { status: 401, headers: CORS });
        const user = await env.DB.prepare('SELECT id, email, name, created_at FROM cm_users WHERE id = ?').bind(payload.sub).first();
        return user ? Response.json({ user }, { headers: CORS }) : Response.json({ error: 'Not found' }, { status: 404, headers: CORS });
      }

      if (path === '/logout' && request.method === 'DELETE') {
        return Response.json({ success: true }, { headers: CORS });
      }

      if (path === '/users' && request.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT id, email, name, created_at FROM cm_users ORDER BY created_at DESC LIMIT 100').all();
        return Response.json({ users: results ?? [] }, { headers: CORS });
      }

      return Response.json({ error: 'Not found' }, { status: 404, headers: CORS });
    } catch {
      return Response.json({ error: 'Internal server error' }, { status: 500, headers: CORS });
    }
  }
};
`

export async function POST(req: Request) {
  const body = await req.json() as { sandboxId?: string; databaseId?: string; projectName?: string; maxUsers?: number }
  const { sandboxId, databaseId, maxUsers } = body

  if (!sandboxId || !databaseId) {
    return NextResponse.json({ error: 'sandboxId and databaseId required' }, { status: 400 })
  }

  const workerName = `cm-auth-${sandboxId.slice(0, 8)}`
  const jwtSecret = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')

  // 1. Create users table in D1
  const tableRes = await fetch(`${CF_BASE}/d1/database/${databaseId}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sql: `CREATE TABLE IF NOT EXISTS cm_users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT DEFAULT '',
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
    }),
  })
  if (!tableRes.ok) {
    const err = await tableRes.json() as { errors?: { message: string }[] }
    return NextResponse.json({ error: err.errors?.[0]?.message ?? 'Failed to create users table' }, { status: 500 })
  }

  // 2. Upload the auth Worker (ES module format)
  const metadata = JSON.stringify({
    main_module: 'worker.js',
    bindings: [
      { type: 'd1', name: 'DB', id: databaseId },
      { type: 'plain_text', name: 'JWT_SECRET', text: jwtSecret },
      { type: 'plain_text', name: 'MAX_USERS', text: maxUsers && maxUsers > 0 ? String(maxUsers) : '0' },
    ],
    compatibility_date: '2024-09-23',
  })

  const form = new FormData()
  form.append('metadata', new Blob([metadata], { type: 'application/json' }), 'metadata.json')
  form.append('worker.js', new Blob([AUTH_WORKER_SCRIPT], { type: 'application/javascript+module' }), 'worker.js')

  const workerRes = await fetch(`${CF_BASE}/workers/scripts/${workerName}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${CF_API_TOKEN}` },
    body: form,
  })

  if (!workerRes.ok) {
    const err = await workerRes.json() as { errors?: { message: string }[] }
    return NextResponse.json({ error: err.errors?.[0]?.message ?? 'Failed to deploy auth worker' }, { status: 500 })
  }

  // 3. Enable workers.dev subdomain for this worker
  await fetch(`${CF_BASE}/workers/scripts/${workerName}/subdomain`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true, previews_enabled: false }),
  })

  const workerUrl = `https://${workerName}.workers.dev`
  return NextResponse.json({ workerUrl, workerName })
}
