/**
 * Verification-success popup: confirms the snippet is installed on the proven
 * origin and invites the owner to close the window.
 */

const POPUP_ID = 'rv-verification-popup';

/** ResponsiveVoice brand glyph (purple speech-wave mark), inlined so the popup
 *  is self-contained — no network fetch, renders before/independent of verify. */
const RV_GLYPH_SVG =
  '<svg width="28" height="28" viewBox="0 0 22 22" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
  '<circle cx="11" cy="11" r="9" fill="white"/>' +
  '<path fill-rule="evenodd" clip-rule="evenodd" d="M11 0C4.92345 0 0 4.92345 0 11C0 13.2683 0.690345 15.3772 1.86621 17.1221L0.811724 21.0517L4.70345 20.0124C6.48621 21.2641 8.65586 22 11 22C17.0766 22 22 17.0766 22 11C22 4.92345 17.0766 0 11 0ZM3.99793 9.99862C3.99793 9.44483 4.44552 8.99724 4.99931 8.99724C5.5531 8.99724 6.00069 9.44483 6.00069 9.99862V12.0014C6.00069 12.5552 5.5531 13.0028 4.99931 13.0028C4.44552 13.0028 3.99793 12.5552 3.99793 12.0014V9.99862ZM8.99724 13.9966C8.99724 14.5503 8.54966 14.9979 7.99586 14.9979C7.44207 14.9979 6.99448 14.5503 6.99448 13.9966V7.99586C6.99448 7.44207 7.44207 6.99448 7.99586 6.99448C8.54966 6.99448 8.99724 7.44207 8.99724 7.99586V13.9966ZM12.0014 17.0007C12.0014 17.5545 11.5538 18.0021 11 18.0021C10.4462 18.0021 9.99862 17.5545 9.99862 17.0007V4.99931C9.99862 4.44552 10.4462 3.99793 11 3.99793C11.5538 3.99793 12.0014 4.44552 12.0014 4.99931V17.0007ZM14.9979 13.9966C14.9979 14.5503 14.5503 14.9979 13.9966 14.9979C13.4428 14.9979 12.9952 14.5503 12.9952 13.9966V7.99586C12.9952 7.44207 13.4428 6.99448 13.9966 6.99448C14.5503 6.99448 14.9979 7.44207 14.9979 7.99586V13.9966ZM18.0021 12.0014C18.0021 12.5552 17.5545 13.0028 17.0007 13.0028C16.4469 13.0028 15.9993 12.5552 15.9993 12.0014V9.99862C15.9993 9.44483 16.4469 8.99724 17.0007 8.99724C17.5545 8.99724 18.0021 9.44483 18.0021 9.99862V12.0014Z" fill="#7A57EE"/>' +
  '</svg>';

export interface VerificationPopupOptions {
  /** The verified origin, shown to the owner. */
  origin: string;
  /** Container to append to; defaults to `document.body`. */
  appendTo?: HTMLElement;
}

/**
 * Render the verification-success popup. Returns the element (so callers can
 * remove it) or null outside a DOM. Idempotent: a second call while one is
 * showing returns the existing element.
 */
export function showVerificationPopup(opts: VerificationPopupOptions): HTMLElement | null {
  if (typeof document === 'undefined') return null;

  const existing = document.getElementById(POPUP_ID);
  if (existing) return existing;

  const container = opts.appendTo ?? document.body;

  const popup = document.createElement('div');
  popup.id = POPUP_ID;
  popup.setAttribute('role', 'status');
  popup.style.cssText = [
    'position:fixed',
    'right:20px',
    'bottom:20px',
    'z-index:2147483647',
    'max-width:340px',
    'padding:16px 18px',
    'background:#fff',
    'color:#1b1b2f',
    'border-radius:10px',
    'box-shadow:0 6px 24px rgba(0,0,0,0.18)',
    'font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  ].join(';');

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:4px';

  const glyph = document.createElement('span');
  glyph.style.cssText = 'display:inline-flex;flex:none';
  glyph.innerHTML = RV_GLYPH_SVG; // static brand markup, no user input

  const title = document.createElement('div');
  title.textContent = 'ResponsiveVoice URL verified';
  title.style.cssText = 'font-weight:600';

  header.append(glyph, title);

  const body = document.createElement('div');
  body.textContent = `Your snippet is correctly installed on ${opts.origin}. You may close this window.`;

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.style.cssText = [
    'margin-top:12px',
    'padding:6px 14px',
    'border:0',
    'border-radius:6px',
    'background:#5b3df5',
    'color:#fff',
    'font-weight:600',
    'cursor:pointer',
  ].join(';');
  close.onclick = () => popup.remove();

  popup.append(header, body, close);
  container.appendChild(popup);
  return popup;
}
