import { Sandbox } from '@vercel/sandbox'
import type { UIMessageStreamWriter, UIMessage } from 'ai'
import type { DataPart } from '../messages/data-parts'
import { tool } from 'ai'
import z from 'zod/v3'
import { logRepair } from '@/lib/telemetry'

// ── Version checkpoint (last-known-good snapshot) ─────────────────────────────
// When all server-side checks pass, the entire project (minus node_modules) is
// tarred inside the sandbox. If a later edit breaks the project beyond repair,
// we restore this snapshot instead of debugging forward — the Lovable pattern:
// "your last change couldn't be applied" always beats a broken preview.

const CHECKPOINT_PATH = '/tmp/cm-checkpoint.tar.gz'

export async function saveCheckpoint(sandbox: Sandbox): Promise<boolean> {
  try {
    const cmd = await sandbox.runCommand({
      detached: true,
      cmd: 'bash',
      args: [
        '-c',
        `cd /vercel/sandbox && tar --exclude=node_modules --exclude=.git --exclude=dist -czf ${CHECKPOINT_PATH}.tmp . 2>/dev/null && mv ${CHECKPOINT_PATH}.tmp ${CHECKPOINT_PATH}`,
      ],
    })
    const done = await Promise.race([
      cmd.wait(),
      new Promise<null>(r => setTimeout(() => r(null), 30_000)),
    ])
    const ok = done !== null && done.exitCode === 0
    if (ok) logRepair({ layer: 'checkpoint', action: 'saved', sandboxId: sandbox.sandboxId })
    return ok
  } catch (e) {
    console.warn('[checkpoint] save failed (non-fatal):', e instanceof Error ? e.message : e)
    return false
  }
}

export async function restoreCheckpointInSandbox(sandbox: Sandbox): Promise<boolean> {
  try {
    // Verify a checkpoint exists before touching anything
    const check = await sandbox.runCommand({
      detached: true,
      cmd: 'bash',
      args: ['-c', `test -f ${CHECKPOINT_PATH}`],
    })
    const checkDone = await check.wait()
    if (checkDone.exitCode !== 0) return false

    const cmd = await sandbox.runCommand({
      detached: true,
      cmd: 'bash',
      args: ['-c', `cd /vercel/sandbox && tar -xzf ${CHECKPOINT_PATH}`],
    })
    const done = await Promise.race([
      cmd.wait(),
      new Promise<null>(r => setTimeout(() => r(null), 30_000)),
    ])
    if (done === null || done.exitCode !== 0) return false

    // Restart the dev server so the restored files are what's actually served
    try {
      const kill = await sandbox.runCommand({
        detached: true,
        cmd: 'bash',
        args: ['-c', 'fuser -k 3000/tcp 2>/dev/null; pkill -f vite 2>/dev/null; sleep 1; exit 0'],
      })
      await kill.wait()
      await sandbox.runCommand({
        detached: true,
        cmd: 'bash',
        args: ['-c', 'command -v bun >/dev/null 2>&1 && bun run dev || pnpm dev'],
      })
    } catch { /* best-effort */ }

    logRepair({ layer: 'checkpoint', action: 'restored', sandboxId: sandbox.sandboxId })
    return true
  } catch (e) {
    console.warn('[checkpoint] restore failed:', e instanceof Error ? e.message : e)
    return false
  }
}

interface Params {
  writer: UIMessageStreamWriter<UIMessage<never, DataPart>>
}

// AI-facing tool: the escape hatch when fixes aren't working. Restores the
// last working version instead of digging a deeper hole.
export const restoreCheckpoint = ({ writer }: Params) =>
  tool({
    description:
      'Restore the project to its last verified working version and restart the preview. ' +
      'Use this when you cannot fix an error after 2 attempts — a working previous version always beats a broken preview. ' +
      'After calling it, tell the user their last change could not be applied and the previous working version was restored.',
    inputSchema: z.object({
      sandboxId: z.string().describe('The workspace ID'),
    }),
    execute: async ({ sandboxId }, { toolCallId }) => {
      writer.write({
        id: toolCallId,
        type: 'data-run-command',
        data: { sandboxId, command: 'Restoring your last working version', args: [], status: 'executing' },
      })
      try {
        const sandbox = await Sandbox.get({ sandboxId })
        const ok = await restoreCheckpointInSandbox(sandbox)
        writer.write({
          id: toolCallId,
          type: 'data-run-command',
          data: { sandboxId, command: 'Restoring your last working version', args: [], status: 'done', exitCode: 0 },
        })
        if (ok) {
          return 'Restored the last working version and restarted the preview. Tell the user their last change could not be applied and the previous working version is back — then ask if they want to try the change a different way.'
        }
        return 'No checkpoint was available to restore. Continue fixing the current files instead — focus on the most recent error message.'
      } catch (err) {
        writer.write({
          id: toolCallId,
          type: 'data-run-command',
          data: { sandboxId, command: 'Restoring your last working version', args: [], status: 'done', exitCode: 0 },
        })
        return `Restore failed: ${err instanceof Error ? err.message : 'unknown'}. Continue fixing the current files instead.`
      }
    },
  })
