import type { NextConfig } from 'next'
import { withBotId } from 'botid/next/config'
import { withWorkflow } from 'workflow/next'

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

export default withWorkflow(withBotId(nextConfig))
