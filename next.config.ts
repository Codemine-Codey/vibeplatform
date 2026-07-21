import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Chromium + puppeteer must stay external — never bundle the browser binary.
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  // CRITICAL: serverExternalPackages keeps the package UNBUNDLED, but Next's file
  // tracer (@vercel/nft) still doesn't follow the dynamic path to @sparticuz/chromium's
  // bin/*.br DATA files (the compressed browser binary), so they were MISSING from the
  // deployed function → executablePath() throws "input directory bin does not exist" →
  // EVERY headless launch failed → the render-check + functionalVerify silently degraded
  // to an HTTP-200 probe → BLANK previews passed verification. Force the bin files in.
  // Use ONLY the real pnpm store path (NOT the node_modules/@sparticuz symlink — including
  // via the symlink makes Vercel reject the function: "invalid deployment package … files
  // in symlinked directories"). The .pnpm/.../@sparticuz/chromium/bin dir holds the real files.
  outputFileTracingIncludes: {
    '/api/chat': ['./node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**'],
    '/api/diag/chromium': ['./node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**'],
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.md/,
      type: 'asset/source',
    })
    return config
  },
  turbopack: {
    rules: {
      '*.md': {
        loaders: ['raw-loader'],
        as: '*.js',
      },
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'vercel.com',
        port: '',
        pathname: '/api/www/avatar/**',
      },
    ],
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
}

// NOTE: removed withWorkflow('workflow/next') — the workflow package is unused (no
// 'use workflow' directives anywhere), but its build hook scanned the whole codebase
// for directives on EVERY dev compile, costing 25-107s each and starving generations
// ("2 min and no workspace"). We use @vercel/sandbox directly, not the workflow runtime.
// BotID removed — its client-side challenge silently blocked the /api/chat generation
// POST in production (0 server hits, empty console, workspace never started). We use
// @vercel/sandbox directly; re-add proper bot protection post-launch if needed.
export default nextConfig
