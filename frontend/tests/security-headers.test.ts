import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

async function headers(mode: 'development' | 'production') {
  vi.stubEnv('NODE_ENV', mode);
  vi.stubEnv('VERCEL', '0');
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test/api');
  const config = (await import('../next.config')).default;
  const rules = await config.headers!();
  const rule = rules.find((item) => item.source === '/:path*');
  expect(rule).toBeDefined();
  return Object.fromEntries(rule!.headers.map(({ key, value }) => [key, value]));
}

describe('frontend security headers', () => {
  it('protects production pages while allowing the configured API and its photos', async () => {
    const result = await headers('production');
    expect(result['X-Frame-Options']).toBe('DENY');
    expect(result['X-Content-Type-Options']).toBe('nosniff');
    expect(result['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(result['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=()');
    expect(result['Strict-Transport-Security']).toBe('max-age=31536000');
    const policy = result['Content-Security-Policy'];
    expect(policy).toContain("connect-src 'self' https://api.example.test");
    expect(policy).toContain("img-src 'self' data: blob: https://api.example.test");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).not.toContain('unsafe-eval');
    expect(policy).not.toContain('ws:');
  });

  it('allows development hot reload and omits HSTS', async () => {
    const result = await headers('development');
    expect(result).not.toHaveProperty('Strict-Transport-Security');
    expect(result['Content-Security-Policy']).toContain("'unsafe-eval'");
    expect(result['Content-Security-Policy']).toContain('ws: wss:');
    expect(result['X-Frame-Options']).toBe('DENY');
  });
});
