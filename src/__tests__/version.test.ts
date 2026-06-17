import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ResponsiveVoice } from '../responsivevoice';

const { version } = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
  version: string;
};

describe('ResponsiveVoice.version', () => {
  it('exposes the package version on the instance', () => {
    const rv = new ResponsiveVoice();
    expect(rv.version).toBe(version);
  });

  it('is a non-empty string', () => {
    const rv = new ResponsiveVoice();
    expect(typeof rv.version).toBe('string');
    expect(rv.version.length).toBeGreaterThan(0);
  });
});
