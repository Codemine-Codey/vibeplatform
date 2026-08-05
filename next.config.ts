import type { NextConfig } from 'next'
import { withWorkflow } from '@workflow/next'

// All dependencies must be external during @workflow/builders esbuild discovery.
// The discovery phase bundles app/api/chat/route.ts following all imports — if any
// package can't be bundled by esbuild it fails silently and the workflow manifest
// stays empty (no flow/step routes generated). Listing every dep here causes
// @workflow/next to pass them as `external` in the discovery esbuild call.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require('./package.json') as {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}
const allDeps = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
]

const nextConfig: NextConfig = {
  // Chromium + puppeteer must stay external — never bundle the browser binary.
  // ALL other deps also listed here so @workflow/builders esbuild discovery doesn't
  // fail silently trying to bundle packages it can't handle (e.g. @vercel/sandbox).
  serverExternalPackages: [...new Set(['@sparticuz/chromium', 'puppeteer-core', ...allDeps])],
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
    // Workflow step functions (stepVerify does headless render check — needs chromium)
    '/.well-known/workflow/v1/step': ['./node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**'],
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

// withWorkflow adds the SWC transform plugin that discovers 'use workflow' / 'use step'
// directives in the workflows/ directory. lazyDiscovery: true prevents the build hook from
// BotID removed — its client-side challenge silently blocked /api/chat in production.
// NOTE: withWorkflow returns a (phase, ctx) => Promise<NextConfig> function which Next.js
// accepts as a valid config export (alongside plain objects). No change to runtime behavior.
// lazyDiscovery removed — with Next.js 16.0.10 the deferred builder isn't available, so
// lazyDiscovery: true + eager builder may skip directory scanning for 'use step' files.
export default withWorkflow(nextConfig)
