import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone', // image Docker légère (plan 4)
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'images.igdb.com' }],
  },
}

export default nextConfig
