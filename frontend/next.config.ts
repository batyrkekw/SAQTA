import type { NextConfig } from 'next';

// A hosted browser must never fall back to the visitor's localhost API.
if (process.env.VERCEL === '1') {
  let apiUrl: URL;
  try { apiUrl = new URL(process.env.NEXT_PUBLIC_API_URL ?? ''); }
  catch { throw new Error('Set NEXT_PUBLIC_API_URL to the public HTTPS backend URL ending in /api before deploying SaqtaFood.'); }
  if (apiUrl.protocol !== 'https:' || ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(apiUrl.hostname)
    || !apiUrl.pathname.replace(/\/$/, '').endsWith('/api') || apiUrl.username || apiUrl.password || apiUrl.search || apiUrl.hash) {
    throw new Error('NEXT_PUBLIC_API_URL must be a public HTTPS backend URL ending in /api, without credentials or query parameters.');
  }
}
const isProduction = process.env.NODE_ENV === 'production';
const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api').origin;
// Inline bootstrap scripts preserve Next's static pages; inline styles support charts.
// Development alone needs eval and WebSockets for React debugging and hot reload.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${apiOrigin}`,
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin}${isProduction ? '' : ' ws: wss:'}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: contentSecurityPolicy },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ...(isProduction ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }] : []),
      ],
    }];
  },
};
export default config;
