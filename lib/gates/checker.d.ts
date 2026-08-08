// Type declarations for the shared .mjs gate core (imported by both the replay
// harness and the Next/TS build pipeline in Phase 2).

export interface GateFailure {
  rung: 'parse' | 'resolve'
  file: string
  specifier?: string
  detail: string
}

export interface FileContent {
  path: string
  content: string
}

export interface GateResult {
  pass: boolean
  failures: GateFailure[]
}

export function parseFile(path: string, code: string): Promise<{ ok: boolean; error?: string }>
export function extractImports(path: string, code: string): Promise<string[]>
export function resolveGate(
  files: Array<{ path: string; imports: string[] }>,
  fileSet: Set<string>,
  hasPackage?: (spec: string) => boolean,
): GateFailure[]
export function runInMemoryGates(
  fileList: FileContent[],
  manifestPaths?: string[],
  hasPackage?: (spec: string) => boolean,
): Promise<GateResult>
