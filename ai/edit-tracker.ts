// Read-first invariant (Lovable's #1 structural fix).
//
// The AI MUST read a file (readFile / readFiles) before it may patchFile it. This
// grounds every edit in the file's CURRENT on-disk content instead of the model's
// imagined version — the root cause of whole-file regeneration and dropped content
// (the "two files were truncated" failure). An un-read patch is bounced back with an
// instruction to read first, converting a blind rewrite into a grounded, targeted edit.
//
// We track which paths have been SERVED to the model per workspace. patchFile checks
// this set. Paths are normalized so "src/App.tsx", "./src/App.tsx" and
// "/app/src/App.tsx" all resolve to the same key.
//
// A file stays "read" for the rest of the session once seen — the optimistic lock in
// patchFile (oldString must exist in the CURRENT content) already rejects stale edits,
// so we don't force a re-read between consecutive patches (which would only add latency).

const readPaths = new Map<string, Set<string>>() // sandboxId -> normalized paths seen

export function normalizePath(path: string): string {
  return path
    .replace(/^\/app\//, '')
    .replace(/^\.?\//, '')
    .replace(/\/+/g, '/')
    .trim()
}

export function markFileRead(sandboxId: string, path: string): void {
  let set = readPaths.get(sandboxId)
  if (!set) {
    set = new Set<string>()
    readPaths.set(sandboxId, set)
  }
  set.add(normalizePath(path))
}

export function hasReadFile(sandboxId: string, path: string): boolean {
  return readPaths.get(sandboxId)?.has(normalizePath(path)) ?? false
}

// A newly-generated file (initial build or a fresh file added mid-session) counts as
// "known" to the model — it just wrote it, so it may patch it without a redundant read.
export function markFileWritten(sandboxId: string, path: string): void {
  markFileRead(sandboxId, path)
}

export function clearEditTracking(sandboxId: string): void {
  readPaths.delete(sandboxId)
}
