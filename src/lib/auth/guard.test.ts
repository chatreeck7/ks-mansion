import { describe, expect, it } from 'vitest';
import { DEFAULT_LANDING, requiresAuth, safeNextPath } from './guard';

describe('requiresAuth', () => {
  it('protects the console routes', () => {
    for (const path of [
      '/console',
      '/console/',
      '/console/rooms',
      '/console/rooms/101',
      '/console/rooms/ร้านซักผ้า',
    ]) {
      expect(requiresAuth(path)).toBe(true);
    }
  });

  it('exempts the login route, or there would be no way in', () => {
    expect(requiresAuth('/console/login')).toBe(false);
    expect(requiresAuth('/console/login/')).toBe(false);
  });

  it('leaves the public marketing site alone', () => {
    for (const path of ['/', '/rooms', '/gallery', '/en/', '/en/gallery', '/favicon.svg']) {
      expect(requiresAuth(path)).toBe(false);
    }
  });

  it('does not match a path that merely starts with the word console', () => {
    // '/console-preview' must not be treated as inside the console, and
    // must not be accidentally *protected* either — it is a different route.
    expect(requiresAuth('/console-preview')).toBe(false);
    expect(requiresAuth('/consolexyz')).toBe(false);
  });

  it('is not fooled by a login-lookalike prefix', () => {
    // Only the exact login route is exempt; anything else under it is not.
    expect(requiresAuth('/console/login-bypass')).toBe(true);
    expect(requiresAuth('/console/loginsomething')).toBe(true);
  });
});

describe('safeNextPath', () => {
  it('keeps a genuine console destination', () => {
    expect(safeNextPath('/console/rooms/101')).toBe('/console/rooms/101');
    expect(safeNextPath('/console/rooms?floor=2')).toBe('/console/rooms?floor=2');
  });

  it('falls back when there is no next', () => {
    expect(safeNextPath(null)).toBe(DEFAULT_LANDING);
    expect(safeNextPath(undefined)).toBe(DEFAULT_LANDING);
    expect(safeNextPath('')).toBe(DEFAULT_LANDING);
  });

  it('refuses to redirect off-site — the open-redirect case', () => {
    for (const hostile of [
      'https://evil.example',
      'http://evil.example',
      '//evil.example',
      '//evil.example/console/rooms',
      'javascript:alert(1)',
    ]) {
      expect(safeNextPath(hostile)).toBe(DEFAULT_LANDING);
    }
  });

  it('refuses to bounce back to the login page, which would loop', () => {
    expect(safeNextPath('/console/login')).toBe(DEFAULT_LANDING);
  });

  it('refuses a public path — login lands you in the console', () => {
    expect(safeNextPath('/gallery')).toBe(DEFAULT_LANDING);
    expect(safeNextPath('/')).toBe(DEFAULT_LANDING);
  });
});
