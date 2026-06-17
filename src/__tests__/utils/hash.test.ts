import { describe, expect, it } from 'vitest';
import { djb2Hash } from '../../utils/hash';

describe('djb2Hash', () => {
  it('should produce consistent output for the same input', () => {
    expect(djb2Hash('hello')).toBe(djb2Hash('hello'));
  });

  it('should produce different output for different inputs', () => {
    expect(djb2Hash('hello')).not.toBe(djb2Hash('world'));
    expect(djb2Hash('key-abc123')).not.toBe(djb2Hash('key-xyz789'));
  });

  it('should handle empty string', () => {
    const result = djb2Hash('');
    expect(result).toBe('1505');
    // Hash of empty string is 5381 in hex = 1505
  });

  it('should return a hex string', () => {
    const result = djb2Hash('test-api-key');
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('should match the known djb2 algorithm output', () => {
    // djb2("a") = ((5381 << 5) + 5381 + 97) | 0 = 177670 = 0x2b606 → unsigned
    const result = djb2Hash('a');
    expect(result).toBe('2b606');
  });
});
