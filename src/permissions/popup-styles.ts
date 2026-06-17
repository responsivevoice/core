/**
 * Permission Popup CSS Styles
 *
 * Inline styles for the permission notification popup.
 * These styles are injected when the popup is shown.
 */

/**
 * Generate CSS styles with a custom class prefix and position.
 *
 * @param prefix - CSS class prefix (default: "rv")
 * @param position - Fixed position: "top" or "bottom" (default: "bottom")
 */
export function generatePopupStyles(prefix = 'rv', position: 'top' | 'bottom' = 'bottom'): string {
  const positionRule = position === 'top' ? 'top: 0;' : 'bottom: 0;';

  return `
.${prefix}Notification {
  position: fixed;
  background-color: #fff;
  text-align: center;
  font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-weight: 400;
  line-height: 1.5;
  box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.2), 0 6px 20px 0 rgba(0, 0, 0, 0.19);
  z-index: 10000;
  width: 100vw;
  left: 0;
  ${positionRule}
  font-size: 1rem;
  padding-bottom: 0.5em;
  padding-right: 0.5em;
}

.${prefix}ButtonRow {
  padding-right: 2em;
  padding-bottom: 1em;
  text-align: right;
  font-size: medium;
}

.${prefix}Button {
  cursor: pointer;
  display: inline-block;
  margin-left: 1em;
  padding: 0.8em 2em;
  border-radius: 3px;
  font-size: small;
}

.${prefix}ButtonAllow {
  border: none;
  background-color: #2b8cff;
  color: #fff;
}

.${prefix}ButtonDeny {
  border: 1px solid #2b8cff;
  color: #2b8cff;
  background-color: #fff;
}

.${prefix}TextRow {
  padding-top: 1em;
  padding-bottom: 2em;
}

@media (min-width: 576px) {
  .${prefix}Notification {
    width: 60vw;
    left: 20vw;
  }
}

@media (min-width: 768px) {
  .${prefix}Notification {
    width: 50vw;
    left: 25vw;
  }
}

@media (min-width: 992px) {
  .${prefix}Notification {
    width: 40vw;
    left: 30vw;
  }
}

@media (min-width: 1200px) {
  .${prefix}Notification {
    width: 30vw;
    left: 35vw;
  }
}`.trim();
}

/**
 * Default CSS styles for the permission popup (rv prefix, bottom position).
 * Pre-generated for zero-cost default path.
 */
export const POPUP_STYLES = generatePopupStyles('rv', 'bottom');

/**
 * Style element ID for cleanup
 */
export const POPUP_STYLE_ID = 'rv-permission-popup-styles';
