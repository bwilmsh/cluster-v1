/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Electron production builds
  // Set NEXT_OUTPUT=standalone to enable: NEXT_OUTPUT=standalone next build
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,

  async rewrites() {
    return [
      {
        source: '/api/v1/auth/:path*',
        destination: 'http://localhost:8000/api/v1/auth/:path*',
      },
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
    ]
  },
  // Allow OAuth redirects from backend to frontend
  async headers() {
    return [
      {
        source: '/integrations',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ]
  },
}

export default nextConfig
