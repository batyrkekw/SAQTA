import type { NextConfig } from 'next';

// A hosted browser must never fall back to the visitor's localhost API.
if (process.env.VERCEL === '1') {
  let apiUrl: URL;
  try { apiUrl = new URL(process.env.NEXT_PUBLIC_API_URL ?? ''); }
  catch { throw new Error('Set NEXT_PUBLIC_API_URL to the public HTTPS backend URL ending in /api before deploying SAQTA.'); }
  if (apiUrl.protocol !== 'https:' || ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(apiUrl.hostname)
    || !apiUrl.pathname.replace(/\/$/, '').endsWith('/api') || apiUrl.username || apiUrl.password || apiUrl.search || apiUrl.hash) {
    throw new Error('NEXT_PUBLIC_API_URL must be a public HTTPS backend URL ending in /api, without credentials or query parameters.');
  }
}
const config: NextConfig = { output: 'standalone', poweredByHeader: false };
export default config;
