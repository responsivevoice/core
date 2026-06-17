import { afterEach, describe, expect, it } from 'vitest';
import { showVerificationPopup } from '../verification-popup';

afterEach(() => {
  document.getElementById('rv-verification-popup')?.remove();
});

describe('showVerificationPopup', () => {
  it('renders a popup naming the verified origin', () => {
    const el = showVerificationPopup({ origin: 'https://site.com' });
    expect(el).not.toBeNull();
    expect(document.getElementById('rv-verification-popup')).toBe(el);
    expect(el?.textContent).toContain('https://site.com');
    expect(el?.textContent).toContain('verified');
  });

  it('renders the inline RV brand glyph', () => {
    const el = showVerificationPopup({ origin: 'https://site.com' });
    const svg = el?.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.innerHTML).toContain('#7A57EE');
  });

  it('is idempotent while one is showing', () => {
    const first = showVerificationPopup({ origin: 'https://a.com' });
    const second = showVerificationPopup({ origin: 'https://b.com' });
    expect(second).toBe(first);
    expect(document.querySelectorAll('#rv-verification-popup')).toHaveLength(1);
  });

  it('removes itself when the close button is clicked', () => {
    const el = showVerificationPopup({ origin: 'https://site.com' });
    el?.querySelector('button')?.click();
    expect(document.getElementById('rv-verification-popup')).toBeNull();
  });
});
