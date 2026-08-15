/** @type {import('next').NextConfig} */
const path = require('path')

function apiOrigin() {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
  // Strip a trailing /api/v1 so rewrites never become /api/v1/api/v1/*
  return raw.replace(/\/?api\/v1\/?$/, '').replace(/\/$/, '') || 'http://127.0.0.1:8000';
}

const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.alias['@'] = path.resolve(__dirname, 'src')
    return config
  },
  async rewrites() {
    const origin = apiOrigin();
    return [
      {
        source: '/api/v1/:path*',
        destination: `${origin}/api/v1/:path*`,
      },
      {
        source: '/demo/:path*',
        destination: `${origin}/demo/:path*`,
      },
    ]
  },
};

module.exports = nextConfig;
