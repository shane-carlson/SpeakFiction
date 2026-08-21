/** Detect whether a System Events osascript failure is a TCC Accessibility denial. */

const ASSISTIVE_DENIED_RE =
  /not allowed assistive access|-25211|-1719|osascript is not allowed|not authorized to send keystrokes/i;

function systemEventsDenied(stderr, message) {
  return ASSISTIVE_DENIED_RE.test(`${stderr || ''}\n${message || ''}`);
}

module.exports = { systemEventsDenied };
