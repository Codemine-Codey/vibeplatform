import { createClient } from '@supabase/supabase-js'
import { readFileSync, appendFileSync } from 'node:fs'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
const a=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const id='9324f90c-'; const log=(m)=>appendFileSync('mon.out',`[${new Date().toTimeString().slice(0,8)}] ${m}\n`)
let last='',fp=0
for(let i=0;i<70;i++){
  const {data:rs}=await a.from('runs').select('*').ilike('id',id+'%').limit(1); const data=rs&&rs[0]
  if(data){const {data:evs}=await a.from('run_events').select('type,payload,created_at').eq('run_id',data.id).order('seq',{ascending:true}).limit(6000)
  const c=new Date(data.created_at).getTime()
  const u=(evs||[]).find(e=>e.type==='data-get-sandbox-url'&&e.payload?.data?.status==='done')
  if(u&&!fp){fp=Math.round((new Date(u.created_at).getTime()-c)/1000);log(`*** PREVIEW @ ${Math.floor(fp/60)}m${String(fp%60).padStart(2,'0')}s → ${u.payload.data.url}`)}
  const s=`status=${data.status} tokens=${data.tokens_used} events=${evs?.length} age=${Math.round((Date.now()-c)/1000)}s`
  if(s!==last){log(s);last=s}
  if(data.status==='done'||data.status==='error'){const tot=Math.round((new Date(data.updated_at).getTime()-c)/1000);log(`### RESULT ${data.status} first-preview=${fp?Math.floor(fp/60)+'m'+String(fp%60).padStart(2,'0')+'s':'n/a'} TOTAL=${Math.floor(tot/60)}m${String(tot%60).padStart(2,'0')}s tokens=${data.tokens_used}`);break}}
  await new Promise(r=>setTimeout(r,10000))
}
process.exit(0)
