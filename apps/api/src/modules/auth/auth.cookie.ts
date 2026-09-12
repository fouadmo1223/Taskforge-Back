import type { CookieOptions, Response } from 'express';

export const REFRESH_COOKIE = 'fd_refresh';

export interface RefreshCookieConfig {
  globalPrefix: string;
  cookieDomain: string;
  cookieSecure: boolean;
  cookieSameSite: 'lax' | 'none' | 'strict';
}

function options(config: RefreshCookieConfig, maxAgeMs?: number): CookieOptions {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    domain: config.cookieDomain || undefined,
    path: `/${config.globalPrefix}/auth`,
    ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
  };
}

export function setRefreshCookie(res: Response, config: RefreshCookieConfig, value: string, maxAgeMs: number): void {
  res.cookie(REFRESH_COOKIE, value, options(config, maxAgeMs));
}

export function clearRefreshCookie(res: Response, config: RefreshCookieConfig): void {
  res.clearCookie(REFRESH_COOKIE, options(config));
}
