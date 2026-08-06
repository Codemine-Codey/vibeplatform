import Prism from 'react-syntax-highlighter'
import grayscale from 'react-syntax-highlighter/dist/esm/styles/hljs/grayscale'
import atomOneDark from 'react-syntax-highlighter/dist/esm/styles/hljs/atom-one-dark'
import { useEffect, useState } from 'react'

function useDarkMode() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const check = () => setDark(document.documentElement.classList.contains('dark') || mq.matches)
    check()
    const mo = new MutationObserver(check)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [])
  return dark
}

export function SyntaxHighlighter(props: { path: string; code: string }) {
  const lang = detectLanguageFromFilename(props.path)
  const dark = useDarkMode()
  return (
    <div
      className="select-none"
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Prism
        language={lang ?? 'javascript'}
        style={dark ? atomOneDark : grayscale}
        showLineNumbers
        showInlineLineNumbers
        customStyle={{
          fontSize: '0.875rem',
          margin: 0,
          background: 'transparent',
        }}
        codeTagProps={{
          style: {
            whiteSpace: 'pre',
            overflowX: 'auto',
            userSelect: 'none',
          },
        }}
      >
        {props.code}
      </Prism>
    </div>
  )
}

function detectLanguageFromFilename(path: string): string {
  const pathParts = path.split('/')
  const extension = pathParts[pathParts.length - 1]
    ?.split('.')
    .pop()
    ?.toLowerCase()

  const extensionMap: Record<string, string> = {
    // JavaScript/TypeScript
    js: 'jsx',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    mjs: 'javascript',
    cjs: 'javascript',

    // Python
    py: 'python',
    pyw: 'python',
    pyi: 'python',

    // Web technologies
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',

    // Other popular languages
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    cxx: 'cpp',
    cc: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    fish: 'bash',
    ps1: 'powershell',

    // Data formats
    json: 'json',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    ini: 'ini',

    // Markup
    md: 'markdown',
    markdown: 'markdown',
    tex: 'latex',

    // Database
    sql: 'sql',

    // Config files
    dockerfile: 'dockerfile',
    gitignore: 'bash',
    env: 'bash',
  }

  return extensionMap[extension || ''] || 'text'
}
