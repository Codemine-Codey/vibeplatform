// One-time provisioning for the multi-tenant auth worker (run once).
// Creates the shared D1, applies the schema, deploys the single worker with the D1
// binding, enables the subdomain, and prints the worker URL + D1 id to put in env.
import { MULTI_TENANT_AUTH_WORKER, MULTI_TENANT_SCHEMA } from '../lib/auth/multi-tenant-worker'

const CF_ID = (process.env.CF_ACCOUNT_ID || '').replace(/[^a-f0-9]/g, '')
const CF_TOK = (process.env.CF_API_TOKEN || '').replace(/[^A-Za-z0-9_-]/g, '')
if (CF_ID !== '8b557a24d9314c5895645b698428ea31') {
  console.error('WRONG/empty CF account — aborting:', CF_ID)
  process.exit(1)
}
const base = `https://api.cloudflare.com/client/v4/accounts/${CF_ID}`
const H = { Authorization: `Bearer ${CF_TOK}` }
const JH = { ...H, 'Content-Type': 'application/json' }

// 1. Create (or find) the shared D1.
let dbId = ''
let r = await fetch(`${base}/d1/database`, { method: 'POST', headers: JH, body: JSON.stringify({ name: 'cm-auth-shared' }) })
let j: any = await r.json()
dbId = j.result?.uuid || ''
if (!dbId) {
  const list = await (await fetch(`${base}/d1/database?per_page=100`, { headers: H })).json() as any
  dbId = (list.result || []).find((d: any) => d.name === 'cm-auth-shared')?.uuid || ''
}
console.log('D1 id:', dbId || 'FAILED', dbId ? '' : JSON.stringify(j.errors)?.slice(0, 200))
if (!dbId) process.exit(1)

// 2. Apply schema (auth_apps + users + index).
for (const sql of MULTI_TENANT_SCHEMA) {
  const sr = await fetch(`${base}/d1/database/${dbId}/raw`, { method: 'POST', headers: JH, body: JSON.stringify({ sql, params: [] }) })
  if (!sr.ok) console.log('schema warn:', (await sr.text()).slice(0, 160))
}
console.log('schema applied')

// 3. Deploy the single worker (ES module) with the D1 binding.
const metadata = JSON.stringify({
  main_module: 'worker.js',
  bindings: [{ type: 'd1', name: 'DB', id: dbId }],
  compatibility_date: '2024-09-23',
})
const form = new FormData()
form.append('metadata', new Blob([metadata], { type: 'application/json' }), 'metadata.json')
form.append('worker.js', new Blob([MULTI_TENANT_AUTH_WORKER], { type: 'application/javascript+module' }), 'worker.js')
r = await fetch(`${base}/workers/scripts/cm-auth`, { method: 'PUT', headers: H, body: form })
console.log('worker deploy:', r.status, r.ok ? 'OK' : (await r.text()).slice(0, 300))

// 4. Enable workers.dev subdomain.
await fetch(`${base}/workers/scripts/cm-auth/subdomain`, { method: 'POST', headers: JH, body: JSON.stringify({ enabled: true, previews_enabled: false }) })

// 5. Resolve the account subdomain → final worker URL.
const sub = await (await fetch(`${base}/workers/subdomain`, { headers: H })).json() as any
const subdomain = sub.result?.subdomain
console.log('\n=== DONE ===')
console.log('CM_AUTH_WORKER_URL=https://cm-auth.' + subdomain + '.workers.dev')
console.log('CM_AUTH_D1_ID=' + dbId)
