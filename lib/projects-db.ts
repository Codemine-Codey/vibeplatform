import type { Sandbox } from '@vercel/sandbox'
import { getServerSupabase, getAdminSupabase } from '@/lib/supabase/server'

const SNAPSHOT_BUCKET = 'project-snapshots'

export interface ProjectRow {
  id: string
  user_id: string
  name: string
  prompt: string | null
  skill: string | null
  sandbox_id: string | null
  preview_url: string | null
  deploy_url: string | null
  snapshot_path: string | null
  // Persistent CF resources — survive the sandbox so the Cloud panels show instantly
  // on reopen (DB tables, auth users, live URL) while the editing workspace warms up.
  database_id: string | null
  database_name: string | null
  auth_enabled: boolean | null
  auth_worker_url: string | null
  tokens_used: number
  created_at: string
  updated_at: string
}

// Read a binary file (e.g. a tar.gz) out of the sandbox into a Buffer.
async function readSandboxBinary(sandbox: Sandbox, path: string): Promise<Buffer | null> {
  try {
    const stream = await sandbox.readFile({ path })
    if (!stream) return null
    const chunks: Buffer[] = []
    for await (const c of stream) {
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as unknown as ArrayBuffer))
    }
    return Buffer.concat(chunks)
  } catch {
    return null
  }
}

// ── Project rows (RLS — each call is scoped to the signed-in user) ────────────
export async function createProjectRow(input: {
  name: string
  prompt: string
  skill: string
}): Promise<string | null> {
  const sb = await getServerSupabase()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return null
  // Per-project Codemine Codey AI token (the app authenticates to the AI proxy
  // with this — never a raw provider key). Scoped + meterable + credit-capped, so a
  // client-side leak only spends that project owner's own credits.
  const aiToken = 'cmai_' + (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
  const { data, error } = await sb
    .from('projects')
    .insert({ user_id: user.id, name: input.name, prompt: input.prompt, skill: input.skill, ai_token: aiToken })
    .select('id')
    .single()
  if (error) {
    console.warn('[projects] createProjectRow failed:', error.message)
    return null
  }
  return data.id as string
}

// Background update (snapshot path, preview url, token count). Runs post-response,
// so it uses the service-role admin client — no request cookies needed. Project
// IDs are unguessable UUIDs created for this user, so updating by id is safe.
export async function updateProjectRow(
  projectId: string,
  patch: Partial<Pick<ProjectRow, 'name' | 'sandbox_id' | 'preview_url' | 'deploy_url' | 'snapshot_path' | 'tokens_used' | 'database_id' | 'database_name' | 'auth_enabled' | 'auth_worker_url'>>
): Promise<void> {
  try {
    const sb = getAdminSupabase()
    await sb.from('projects').update(patch).eq('id', projectId)
  } catch (e) {
    console.warn('[projects] updateProjectRow failed:', e instanceof Error ? e.message : e)
  }
}

export async function listProjects(): Promise<ProjectRow[]> {
  const sb = await getServerSupabase()
  const { data, error } = await sb.from('projects').select('*').order('updated_at', { ascending: false })
  if (error) return []
  return (data ?? []) as ProjectRow[]
}

export async function getProject(projectId: string): Promise<ProjectRow | null> {
  const sb = await getServerSupabase()
  const { data, error } = await sb.from('projects').select('*').eq('id', projectId).single()
  if (error) return null
  return data as ProjectRow
}

// Background lookup by sandbox (used after an edit turn to re-snapshot the right
// project). Admin client — runs post-response, no request cookies. Returns the
// most-recently-updated matching row.
export async function getProjectBySandboxId(sandboxId: string): Promise<ProjectRow | null> {
  try {
    const sb = getAdminSupabase()
    const { data } = await sb
      .from('projects')
      .select('*')
      .eq('sandbox_id', sandboxId)
      .order('updated_at', { ascending: false })
      .limit(1)
    return (data?.[0] as ProjectRow) ?? null
  } catch {
    return null
  }
}

// Persist resource state (database/auth/deploy) onto the project that owns a sandbox.
// Used by the database/auth/deploy routes, which only know the sandboxId — so the
// Cloud panels can show this instantly on reopen, independent of the workspace.
export async function updateProjectBySandboxId(
  sandboxId: string,
  patch: Partial<Pick<ProjectRow, 'database_id' | 'database_name' | 'auth_enabled' | 'auth_worker_url' | 'deploy_url'>>
): Promise<void> {
  try {
    const project = await getProjectBySandboxId(sandboxId)
    if (project) await updateProjectRow(project.id, patch)
  } catch (e) {
    console.warn('[projects] updateProjectBySandboxId failed:', e instanceof Error ? e.message : e)
  }
}

// Add to the cumulative token count (read-modify-write; fine at this scale).
export async function incrementProjectTokens(projectId: string, delta: number): Promise<void> {
  if (!delta || delta <= 0) return
  try {
    const sb = getAdminSupabase()
    const { data } = await sb.from('projects').select('tokens_used').eq('id', projectId).single()
    const current = (data?.tokens_used as number) ?? 0
    await sb.from('projects').update({ tokens_used: current + delta }).eq('id', projectId)
  } catch {
    /* non-fatal */
  }
}

export async function deleteProjectDb(projectId: string): Promise<void> {
  const sb = await getServerSupabase()
  const project = await getProject(projectId)
  if (project?.snapshot_path) {
    try {
      await sb.storage.from(SNAPSHOT_BUCKET).remove([project.snapshot_path])
    } catch {
      /* ignore */
    }
  }
  await sb.from('projects').delete().eq('id', projectId)
}

// ── File snapshots (tar.gz of the project source → Supabase Storage) ──────────
// The sandbox is ephemeral; the snapshot is the durable source of truth so a
// project can be reopened in a fresh sandbox from the dashboard.
export async function snapshotProject(
  sandbox: Sandbox,
  userId: string,
  projectId: string
): Promise<string | null> {
  try {
    const tarCmd = await sandbox.runCommand({
      detached: true,
      cmd: 'bash',
      args: [
        '-c',
        'cd /vercel/sandbox && tar --exclude=node_modules --exclude=.git --exclude=dist -czf /tmp/cm-snapshot.tar.gz . 2>/dev/null && echo OK',
      ],
    })
    await Promise.race([
      tarCmd.wait(),
      new Promise<void>((_, rej) => setTimeout(() => rej(new Error('tar timeout')), 30_000)),
    ])
    const buf = await readSandboxBinary(sandbox, '/tmp/cm-snapshot.tar.gz')
    if (!buf || buf.length === 0) return null

    const path = `${userId}/${projectId}.tar.gz`
    const sb = getAdminSupabase()
    const { error } = await sb.storage
      .from(SNAPSHOT_BUCKET)
      .upload(path, buf, { upsert: true, contentType: 'application/gzip' })
    if (error) {
      console.warn('[projects] snapshot upload failed:', error.message)
      return null
    }
    return path
  } catch (e) {
    console.warn('[projects] snapshotProject failed:', e instanceof Error ? e.message : e)
    return null
  }
}

// Restore a snapshot into a fresh sandbox: download the tar.gz, write it in, extract.
// Caller then runs install + dev. Returns true on success.
export async function restoreSnapshotInto(sandbox: Sandbox, snapshotPath: string): Promise<boolean> {
  try {
    const sb = getAdminSupabase()
    const { data, error } = await sb.storage.from(SNAPSHOT_BUCKET).download(snapshotPath)
    if (error || !data) return false
    const buf = Buffer.from(await data.arrayBuffer())
    await sandbox.writeFiles([{ path: '/tmp/cm-restore.tar.gz', content: buf }])
    const cmd = await sandbox.runCommand({
      detached: true,
      cmd: 'bash',
      args: ['-c', 'cd /vercel/sandbox && tar -xzf /tmp/cm-restore.tar.gz 2>/dev/null && echo OK'],
    })
    const done = await cmd.wait()
    return done.exitCode === 0
  } catch (e) {
    console.warn('[projects] restoreSnapshotInto failed:', e instanceof Error ? e.message : e)
    return false
  }
}
