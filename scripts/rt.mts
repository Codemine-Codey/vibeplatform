// Fire a build against a URL, monitor the run to completion via the DB, report metrics.
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
const URL=env.NEXT_PUBLIC_SUPABASE_URL, ANON=env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRK=env.SUPABASE_SERVICE_ROLE_KEY
const admin=createClient(URL,SRK,{auth:{persistSession:false}})
const [base,label,prompt]=process.argv.slice(2)
const jar=new Map<string,string>()
const sb=createServerClient(URL,ANON,{cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:(l:any)=>l.forEach(({name,value}:any)=>jar.set(name,value))}})
const {error}=await sb.auth.signInWithPassword({email:'test@codemine.app',password:'CodemineTest2026!'})
if(error){console.log('AUTH FAIL',error.message);process.exit(1)}
console.log(`  cookies set: ${[...jar.keys()].join(', ')}`)
const cookie=[...jar].map(([n,v])=>`${n}=${v}`).join('; ')
const body=JSON.stringify({messages:[{id:randomUUID(),role:'user',parts:[{type:'text',text:prompt}]}]})
const fireAt=new Date()
const res=await fetch(base+'/api/chat',{method:'POST',headers:{'content-type':'application/json',cookie},body})
console.log(`[${label}] HTTP ${res.status} @ ${fireAt.toTimeString().slice(0,8)}`)
if(!res.ok&&res.status!==200){const t=await res.text().catch(()=>'');console.log(`  body: ${t.slice(0,200)}`);process.exit(1)}
let runId=''
// AI SDK v4+ streams data parts as: data: 2:[{"type":"data-run","data":{"runId":"..."}}]
// OR plain JSON: data: {"type":"data-run","data":{"runId":"..."}}
// Parse both formats.
try{
  const rd=res.body!.getReader();const dec=new TextDecoder();let buf='';
  outer:for(;;){
    const {done,value}=await rd.read();if(done)break
    buf+=dec.decode(value,{stream:true});const ls=buf.split('\n');buf=ls.pop()||''
    for(const l of ls){
      if(!l.startsWith('data:'))continue
      const raw=l.slice(5).trim()
      // Try plain JSON first
      try{const e=JSON.parse(raw);if(e.type==='data-run'&&e.data?.runId){runId=e.data.runId;rd.cancel();break outer}}catch{}
      // Try AI SDK data-array format: 2:[{...}]
      if(raw.startsWith('2:[')){
        try{const arr=JSON.parse(raw.slice(2));for(const e of arr){if(e?.type==='data-run'&&e?.data?.runId){runId=e.data.runId;rd.cancel();break outer}}}catch{}
      }
    }
  }
}catch{}
if(!runId){
  // Fallback: find the most recent run created after fireAt for the test user
  const {data:fresh}=await admin.from('runs').select('id').gte('created_at',fireAt.toISOString()).order('created_at',{ascending:false}).limit(1)
  runId=fresh?.[0]?.id??''
  if(runId)console.log(`  [fallback] found runId by timestamp: ${runId.slice(0,8)}`)
}
console.log(`[${label}] tracking runId=${runId.slice(0,8)}`)
const t0=Date.now()
let last='',fp=0
for(let i=0;i<90;i++){
  const {data}=await admin.from('runs').select('*').eq('id',runId).single()
  if(!data){await new Promise(r=>setTimeout(r,8000));continue}
  const {data:evs}=await admin.from('run_events').select('type,payload,created_at').eq('run_id',runId).order('seq',{ascending:true}).limit(6000)
  const c=new Date(data.created_at).getTime()
  const urlEv=(evs||[]).find(e=>e.type==='data-get-sandbox-url'&&(e.payload as any)?.data?.status==='done')
  if(urlEv&&!fp){fp=Math.round((new Date(urlEv.created_at as string).getTime()-c)/1000);console.log(`  PREVIEW @ ${Math.floor(fp/60)}m${String(fp%60).padStart(2,'0')}s → ${(urlEv.payload as any).data.url}`)}
  const st=`status=${data.status} phase=${data.phase_cursor} tokens=${data.tokens_used} events=${evs?.length} age=${Math.round((Date.now()-c)/1000)}s`
  if(st!==last){console.log('  '+st);last=st}
  if(data.status==='done'||data.status==='error'){
    const tot=Math.round((new Date(data.updated_at).getTime()-c)/1000)
    const mf=Array.isArray(data.manifest)?data.manifest.reduce((m:number,f:any)=>Math.max(m,Number(f?.phase)||1),1):null
    console.log(`\n=== ${label} RESULT ===\nstatus=${data.status}\nfirst-preview=${fp?Math.floor(fp/60)+'m'+String(fp%60).padStart(2,'0')+'s':'n/a'}\nTOTAL=${Math.floor(tot/60)}m${String(tot%60).padStart(2,'0')}s\nphases=${data.phase_cursor}/${mf}\ntokens=${data.tokens_used}\nsandbox=${data.sandbox_id}`)
    break
  }
  await new Promise(r=>setTimeout(r,8000))
}
process.exit(0)
