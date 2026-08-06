import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@rutas/shared'],
  outputFileTracingRoot: `${import.meta.dirname}/../..`,
  typedRoutes: true,
};

export default nextConfig;
