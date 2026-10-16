import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { type NextConfig } from 'next'

const isProduction = process.env.NODE_ENV === 'production'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

const baseConfig: NextConfig = {
  compiler: {
    reactRemoveProperties: isProduction,
    removeConsole: isProduction ? { exclude: ['error'] } : false,
  },
  devIndicators: false,
  enablePrerenderSourceMaps: !isProduction,
  poweredByHeader: false,
  productionBrowserSourceMaps: !isProduction,
  reactCompiler: isProduction,
  reactStrictMode: true,
  serverExternalPackages: ['node:sqlite'],
  trailingSlash: false,
  turbopack: {
    root: path.resolve(dirname),
    resolveExtensions: ['.tsx', '.ts', '.js', '.mjs', '.json'],
  },
  experimental: {
    cpus: 2,
    inlineCss: true,
    sri: {
      algorithm: 'sha256',
    },
    turbopackRemoveUnusedExports: isProduction,
    turbopackSourceMaps: !isProduction,
    useTypeScriptCli: true,
    webpackMemoryOptimizations: isProduction,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ]
  },
}
export default baseConfig
