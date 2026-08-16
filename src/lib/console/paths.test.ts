import { describe, expect, it } from 'vitest';
import { joinBase } from './paths';

describe('joinBase', () => {
  it('joins a base and a path', () => {
    expect(joinBase('/ks-mansion', 'console/rooms')).toBe('/ks-mansion/console/rooms');
  });

  it('tolerates a trailing slash on the base', () => {
    expect(joinBase('/ks-mansion/', 'console/rooms')).toBe('/ks-mansion/console/rooms');
  });

  it('tolerates a leading slash on the path', () => {
    expect(joinBase('/ks-mansion', '/console/rooms')).toBe('/ks-mansion/console/rooms');
  });

  it('handles a root base without doubling the slash', () => {
    expect(joinBase('/', 'console/rooms')).toBe('/console/rooms');
  });
});
