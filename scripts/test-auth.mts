// Security test for the multi-tenant auth worker — proves strict per-app isolation.
const CF_ID = (process.env.CF_ACCOUNT_ID || '').replace(/[^a-f0-9]/g, '')
const CF_TOK = (process.env.CF_API_TOKEN || '').replace(/[^A-Za-z0-9_-]/g, '')
const D1 = (process.env.CM_AUTH_D1_ID || '').trim()
const W = (process.env.CM_AUTH_WORKER_URL || '').trim()
const A = 'test-app-A-' + Date.now()
const B = 'test-app-B-' + Date.now()

async function d1(sql: string, params: unknown[] = []) {
  await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ID}/d1/database/${D1}/raw`, {
    method: 'POST', headers: { Authorization: `Bearer ${CF_TOK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  })
}
const post = (app: string, action: string, body: unknown, token?: string) =>
  fetch(`${W}/${app}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) })
const get = (app: string, action: string, token?: string) =>
  fetch(`${W}/${app}/${action}`, { headers: token ? { Authorization: 'Bearer ' + token } : {} })

let pass = 0, fail = 0
const check = (name: string, ok: boolean) => { console.log((ok ? '✅' : '❌') + ' ' + name); ok ? pass++ : fail++ }

// Register two apps with DIFFERENT secrets.
await d1('INSERT OR REPLACE INTO auth_apps (app_id, jwt_secret, origins, created_at) VALUES (?,?,?,?)', [A, 'secretA' + Math.random(), '["*"]', new Date().toISOString()])
await d1('INSERT OR REPLACE INTO auth_apps (app_id, jwt_secret, origins, created_at) VALUES (?,?,?,?)', [B, 'secretB' + Math.random(), '["*"]', new Date().toISOString()])

// 1. Signup on app A.
const suA = await post(A, 'signup', { email: 'alice@test.com', password: 'password123' })
const suAj = await suA.json() as any
check('signup on app A succeeds', suA.status === 200 && !!suAj.token)
const tokenA = suAj.token

// 2. /me on app A with A's token works.
const meA = await get(A, 'me', tokenA)
check('/me on app A with A token works', meA.status === 200)

// 3. ISOLATION: A's token must NOT work on app B.
const meB = await get(B, 'me', tokenA)
check('ISOLATION: A token rejected on app B (401)', meB.status === 401)

// 4. Same email can exist independently on app B (no cross-app collision).
const suB = await post(B, 'signup', { email: 'alice@test.com', password: 'password123' })
check('same email signs up independently on app B', suB.status === 200)

// 5. Unregistered app → 404 (clean JSON, no Cloudflare).
const un = await get('totally-unregistered-' + Date.now(), 'me')
const unText = await un.text()
check('unregistered app → 404, no Cloudflare branding', un.status === 404 && !/cloudflare/i.test(unText))

// 6. Wrong password rejected.
const wrong = await post(A, 'login', { email: 'alice@test.com', password: 'WRONG' })
check('wrong password → 401', wrong.status === 401)

// Cleanup.
await d1('DELETE FROM users WHERE app_id IN (?,?)', [A, B])
await d1('DELETE FROM auth_apps WHERE app_id IN (?,?)', [A, B])

console.log(`\n${pass}/${pass + fail} passed` + (fail ? ' — FAILURES PRESENT' : ' — ALL SECURITY CHECKS PASS'))
