import { NextResponse } from 'next/server'
import { Sandbox } from '@vercel/sandbox'
import { getProject, updateProjectRow, restoreSnapshotInto } from '@/lib/projects-db'
import { restoreBakedDeps } from '@/lib/baked-deps'

export const maxDuration = 300

// Reopen a saved project: spin a fresh sandbox, restore its file snapshot, install
// deps, start the dev server, and return the live URL. The sandbox is disposable;
// the snapshot in Storage is the source of truth (RLS ensures the caller owns it).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const project = await getProject(id) // RLS — only the owner's row is returned
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  if (!project.snapshot_path) {
    return NextResponse.json({ error: 'This project has no saved snapshot yet.' }, { status: 400 })
  }

  let sandbox: Sandbox
  try {
    sandbox = await Sandbox.create({ timeout: 1_800_000, ports: [3000] })
  } catch {
    return NextResponse.json({ error: 'Could not start a workspace. Please try again.' }, { status: 500 })
  }

  const restored = await restoreSnapshotInto(sandbox, project.snapshot_path)
  if (!restored) {
    return NextResponse.json({ error: 'Could not restore the project files.' }, { status: 500 })
  }

  // Restore the baked node_modules (fast extract) — node_modules isn't in the
  // snapshot. Then a reconcile install for any package this project added. This
  // is the critical-path install for resume, so the baked extract matters most here.
  const baked = await restoreBakedDeps(sandbox, project.skill as any).catch(() => false)
  try {
    const install = await sandbox.runCommand({
      detached: true,
      cmd: 'bash',
      args: ['-c', baked
        ? 'command -v bun >/dev/null 2>&1 && bun install --no-save || pnpm install --prefer-offline'
        : 'command -v bun >/dev/null 2>&1 && bun install || pnpm install'],
    })
    await Promise.race([
      install.wait(),
      new Promise<void>((_, rej) => setTimeout(() => rej(new Error('install timeout')), 120_000)),
    ])
  } catch {
    /* non-fatal — dev may still start */
  }

  // Start the dev server (background).
  try {
    await sandbox.runCommand({
      detached: true,
      cmd: 'bash',
      args: ['-c', 'command -v bun >/dev/null 2>&1 && bun run dev || pnpm dev'],
    })
  } catch {
    /* non-fatal */
  }

  // Wait for Vite to be listening (non-502).
  const url = sandbox.domain(3000)
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
      if (res.status !== 502) break
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 2500))
  }

  await updateProjectRow(id, { sandbox_id: sandbox.sandboxId, preview_url: url })

  // Return the persisted resource state so the Cloud panels (DB/auth/live URL) render
  // INSTANTLY on reopen — they're independent of the (slower) editing workspace.
  return NextResponse.json({
    url,
    sandboxId: sandbox.sandboxId,
    projectId: project.id,
    projectName: project.name,
    databaseId: project.database_id ?? undefined,
    databaseName: project.database_name ?? undefined,
    authEnabled: project.auth_enabled ?? undefined,
    authWorkerUrl: project.auth_worker_url ?? undefined,
    authAppId: project.auth_enabled ? project.id : undefined, // appId == project id
    deployedUrl: project.deploy_url ?? undefined,
    // Reopen & Continue — the saved conversation so the builder restores the chat.
    chatMessages: project.chat_messages ?? undefined,
    chatSummary: project.chat_summary ?? undefined,
  })
}
