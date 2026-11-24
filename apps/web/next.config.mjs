import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@tokenburn/core'],
  outputFileTracingRoot: join(here, '../..'),
  poweredByHeader: false,
};

export default nextConfig;
