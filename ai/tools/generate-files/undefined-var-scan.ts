// ── Deterministic undefined-variable scanner (AST-based) ──────────────────────
// Catches the exact crash class that shipped a broken preview: an identifier USED in
// render/expression position that is declared NOWHERE in the file and is not a known
// global — e.g. `navLinks.map(...)` when `navLinks` was never defined or imported.
// `tsc --noEmit` in the sandbox is unreliable for this (needs full type resolution);
// here we have the file in memory, so we parse it with the TypeScript AST and do a
// conservative, over-approximate scope check.
//
// SAFETY FIRST (the user's hard rule: no false positives / no needless regen):
//  • We collect declared names across the WHOLE file, ignoring block scope. This
//    OVER-approximates what's in scope, so we UNDER-report — a name declared anywhere
//    counts as known. That trades missed edge cases for near-zero false positives.
//  • We only flag value-position identifiers: never property accesses (`obj.x`), never
//    type references, never JSX attribute names, never object-literal keys, never
//    import/export specifiers.
//  • A large allow-list of browser + JS globals is treated as declared.
// The result feeds the existing footgun repair, which regenerates only the offending file.

import * as ts from 'typescript'

// Browser + standard-library globals that are legitimately used without a local
// declaration. Kept broad on purpose — a missing entry would be a false positive.
const GLOBALS = new Set<string>([
  // JS language
  'undefined', 'null', 'NaN', 'Infinity', 'globalThis', 'arguments', 'this', 'super',
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol', 'BigInt', 'Function',
  'Math', 'JSON', 'Date', 'RegExp', 'Error', 'TypeError', 'RangeError', 'SyntaxError',
  'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Proxy', 'Reflect', 'Intl',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
  'encodeURI', 'decodeURI', 'structuredClone', 'queueMicrotask',
  'Array', 'ArrayBuffer', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array',
  'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'DataView',
  // timers
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback',
  // DOM / BOM
  'window', 'document', 'console', 'navigator', 'location', 'history', 'screen',
  'alert', 'confirm', 'prompt', 'fetch', 'localStorage', 'sessionStorage', 'indexedDB',
  'URL', 'URLSearchParams', 'FormData', 'Blob', 'File', 'FileReader', 'Headers', 'Request', 'Response',
  'Image', 'Audio', 'AudioContext', 'webkitAudioContext', 'MediaRecorder',
  'AbortController', 'AbortSignal', 'EventSource', 'WebSocket', 'Worker', 'BroadcastChannel',
  'IntersectionObserver', 'ResizeObserver', 'MutationObserver', 'PerformanceObserver',
  'CustomEvent', 'Event', 'EventTarget', 'MessageChannel', 'MessagePort',
  'KeyboardEvent', 'MouseEvent', 'TouchEvent', 'PointerEvent', 'WheelEvent', 'DragEvent',
  'InputEvent', 'FocusEvent', 'ClipboardEvent', 'AnimationEvent', 'TransitionEvent',
  'HTMLElement', 'HTMLCanvasElement', 'HTMLImageElement', 'HTMLInputElement', 'HTMLAudioElement',
  'HTMLVideoElement', 'Element', 'Node', 'NodeList', 'DOMParser', 'XMLHttpRequest',
  'CanvasRenderingContext2D', 'Path2D', 'ImageData', 'DOMRect', 'getComputedStyle',
  'crypto', 'performance', 'matchMedia', 'scrollTo', 'scrollBy', 'open', 'close',
  'atob', 'btoa', 'reportError', 'devicePixelRatio', 'innerWidth', 'innerHeight',
  // Node-ish that Vite defines / people reference
  'process', 'Buffer', 'require', 'module', 'exports', '__dirname', '__filename',
  // React ecosystem globals commonly referenced without a value import
  'React', 'JSX', 'globalThis',
])

// Collect every name INTRODUCED anywhere in the file (imports, decls, params,
// destructuring, functions, classes, catch bindings, type params). Over-approximate.
function collectDeclaredNames(sf: ts.SourceFile): Set<string> {
  const declared = new Set<string>()

  const addBinding = (name: ts.BindingName | undefined): void => {
    if (!name) return
    if (ts.isIdentifier(name)) {
      declared.add(name.text)
    } else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      for (const el of name.elements) {
        if (ts.isBindingElement(el)) addBinding(el.name)
      }
    }
  }

  const visit = (node: ts.Node): void => {
    // import ... from '...'
    if (ts.isImportClause(node)) {
      if (node.name) declared.add(node.name.text)
      if (node.namedBindings) {
        if (ts.isNamespaceImport(node.namedBindings)) declared.add(node.namedBindings.name.text)
        else for (const spec of node.namedBindings.elements) declared.add(spec.name.text)
      }
    }
    if (ts.isVariableDeclaration(node)) addBinding(node.name)
    if (ts.isParameter(node)) addBinding(node.name)
    if (ts.isBindingElement(node)) addBinding(node.name)
    if (ts.isFunctionDeclaration(node) && node.name) declared.add(node.name.text)
    if (ts.isClassDeclaration(node) && node.name) declared.add(node.name.text)
    if (ts.isEnumDeclaration(node) && node.name) declared.add(node.name.text)
    if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name) declared.add(node.name.text)
    if (ts.isCatchClause(node) && node.variableDeclaration) addBinding(node.variableDeclaration.name)
    if (ts.isTypeParameterDeclaration(node)) declared.add(node.name.text)
    // named function/arrow expressions bound to a name are covered by VariableDeclaration
    if (ts.isFunctionExpression(node) && node.name) declared.add(node.name.text)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return declared
}

// Is this identifier a genuine VALUE reference (not a property, key, type, attr name)?
function isValueReference(id: ts.Identifier): boolean {
  const p = id.parent
  if (!p) return false
  // obj.PROP — the property name is not a free variable
  if (ts.isPropertyAccessExpression(p) && p.name === id) return false
  // { key: value } — a non-shorthand key is not a variable
  if (ts.isPropertyAssignment(p) && p.name === id) return false
  // import/export specifiers, binding names, declaration names
  if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p)) return false
  if (ts.isBindingElement(p) && p.name === id) return false
  if ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isFunctionDeclaration(p) || ts.isClassDeclaration(p) || ts.isFunctionExpression(p)) && (p as { name?: ts.Node }).name === id) return false
  if (ts.isPropertySignature(p) || ts.isMethodSignature(p) || ts.isEnumMember(p)) return false
  // JSX attribute NAME (the `foo` in foo={...}) is not a variable
  if (ts.isJsxAttribute(p) && p.name === id) return false
  // JSX tag name (<nav>, <Foo/>, </nav>) — intrinsic tags are strings, and undeclared
  // components are handled by the import-closure gate. Skip tag names entirely to avoid
  // flagging every lowercase element (div/span/canvas).
  if ((ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxClosingElement(p)) && p.tagName === id) return false
  // label
  if (ts.isLabeledStatement(p) && p.label === id) return false
  // TYPE positions — skip anything under a type node
  let cur: ts.Node | undefined = p
  while (cur) {
    if (
      ts.isTypeReferenceNode(cur) || ts.isTypeQueryNode(cur) || ts.isTypeAliasDeclaration(cur) ||
      ts.isInterfaceDeclaration(cur) || ts.isTypeParameterDeclaration(cur) ||
      ts.isExpressionWithTypeArguments(cur) || ts.isHeritageClause(cur) ||
      (cur.kind >= ts.SyntaxKind.FirstTypeNode && cur.kind <= ts.SyntaxKind.LastTypeNode)
    ) {
      return false
    }
    // stop climbing at statement / expression boundaries to bound the walk
    if (ts.isBlock(cur) || ts.isSourceFile(cur)) break
    cur = cur.parent
  }
  // Qualified names (A.B in types) handled by type skip above.
  return true
}

export type UndefinedVar = { path: string; issue: string }

export function scanUndefinedVars(files: { path: string; content: string }[]): UndefinedVar[] {
  const out: UndefinedVar[] = []
  for (const f of files) {
    if (!/\.(tsx|jsx|ts|js)$/.test(f.path)) continue
    let sf: ts.SourceFile
    try {
      sf = ts.createSourceFile(f.path, f.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    } catch {
      continue // unparseable → the syntax gate handles it
    }
    const declared = collectDeclaredNames(sf)
    const missing = new Set<string>()

    const walk = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && node.text) {
        const name = node.text
        if (
          !declared.has(name) &&
          !GLOBALS.has(name) &&
          !missing.has(name) &&
          isValueReference(node)
        ) {
          // Capitalized JSX component OR a lowercased data identifier — both crash if
          // used and undeclared. Lowercase intrinsic JSX tags (div/span) never reach
          // here because the tag name of an intrinsic element is a value reference only
          // when it's an Identifier the parser treats as a component (capitalized).
          missing.add(name)
        }
      }
      ts.forEachChild(node, walk)
    }
    walk(sf)

    for (const name of missing) {
      out.push({
        path: f.path,
        issue:
          `\`${name}\` is used but never declared or imported in this file — this throws ` +
          `"ReferenceError: ${name} is not defined" and shows the error screen. Declare ${name} ` +
          `(e.g. a const array/object with real data) or import it, and make sure every usage matches.`,
      })
    }
  }
  return out
}
