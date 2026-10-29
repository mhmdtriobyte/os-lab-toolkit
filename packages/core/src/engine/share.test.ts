import { describe, expect, it } from 'vitest';
import { decodeState, encodeState, formatHash, parseHash } from './share';

describe('share', () => {
  it('round-trips values through the URL encoding', () => {
    const value = { code: 'int main() { fork(); }\n', n: 3 };
    expect(decodeState(encodeState(value))).toEqual(value);
  });

  it('rejects garbage', () => {
    expect(decodeState('%%%not-valid')).toBeUndefined();
  });

  it('parses and formats hashes', () => {
    const s = encodeState({ a: 1 });
    expect(parseHash(formatHash({ s }))).toEqual({ s });
    expect(parseHash('#ex=orphan')).toEqual({ ex: 'orphan' });
  });
});
