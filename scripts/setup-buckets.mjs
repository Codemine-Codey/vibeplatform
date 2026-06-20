// One-time: create the storage buckets with the service role.
// Run: node --env-file=.env.local scripts/setup-buckets.mjs
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function ensure(id, options) {
  const { error } = await sb.storage.createBucket(id, options)
  if (error && !/already exists/i.test(error.message)) {
    console.log(`FAILED ${id}: ${error.message}`)
  } else {
    console.log(`OK ${id}${error ? ' (already existed)' : ''}`)
  }
}

// Private — project file snapshots (server-only access via service role)
await ensure('project-snapshots', { public: false, fileSizeLimit: '10MB' })
// Public-read — user-uploaded images served over CDN
await ensure('assets', { public: true, fileSizeLimit: '15MB' })

const { data } = await sb.storage.listBuckets()
console.log('Buckets now:', data.map((b) => `${b.name}(${b.public ? 'public' : 'private'})`).join(', '))
