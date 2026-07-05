import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const {data}=await admin.from('runs').select('*').order('created_at',{ascending:false}).limit(3)
for(const r of data||[]){
  const mf=Array.isArray(r.manifest)?r.manifest.reduce((m,f)=>Math.max(m,Number(f?.phase)||1),1):null
  const age=Math.round((Date.now()-new Date(r.created_at).getTime())/1000)
  const upd=Math.round((Date.now()-new Date(r.updated_at).getTime())/1000)
  console.log(`run ${r.id.slice(0,8)} status=${r.status} phase=${r.phase_cursor}/${mf} tokens=${r.tokens_used} age=${age}s lastUpd=${upd}s ago files=${Array.isArray(r.manifest)?r.manifest.length:0}`)
  const {count}=await admin.from('run_events').select('*',{count:'exact',head:true}).eq('run_id',r.id)
  console.log(`   events=${count}`)
}
process.exit(0)
