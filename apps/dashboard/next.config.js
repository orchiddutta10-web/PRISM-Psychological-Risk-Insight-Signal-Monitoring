/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const apiBase = process.env.PRISM_API_BASE_URL || 'http://127.0.0.1:8000'
    const edgeBase = process.env.PRISM_EDGE_BASE_URL || 'http://127.0.0.1:8081'
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiBase.replace(/\/$/, '')}/api/v1/:path*`, // Proxy to API
      },
      {
        source: '/camera/:path*',
        destination: `${edgeBase.replace(/\/$/, '')}/camera/:path*`, // Proxy to Edge camera stream
      },
    ]
  },
};

module.exports = nextConfig;
