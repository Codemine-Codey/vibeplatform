import type { NextConfig } from 'next'
import { withBotId } from 'botid/next/config'

const nextConfig: NextConfig = {
  // Chromium + puppeteer must stay external — never bundle the browser binary.
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
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
export default withBotId(nextConfig)
