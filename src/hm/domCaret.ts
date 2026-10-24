/**
 * Caret mapping for a contenteditable paragraph.
 * Adapted from Speak Fiction's dictation draft offsets: text nodes count,
 * and a BR counts as one character. SpeakFiction paragraphs do not insert BR.
 */

export function offsetsFromDomRange(root: HTMLElement, range: Range): { start: number; end: number } {
  const locate = (container: Node, offset: number): number => {
    let pos = 0;
    let found: number | null = null;

    const walk = (node: Node) => {
      if (found != null) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? '';
        if (node === container) {
          found = pos + Math.max(0, Math.min(offset, text.length));
          return;
        }
        pos += text.length;
        return;
      }
      if (node.nodeName === 'BR') {
        if (node === container) {
          found = pos;
          return;
        }
        pos += 1;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node === container) {
        const children = Array.from(node.childNodes);
        const n = Math.max(0, Math.min(offset, children.length));
        for (let i = 0; i < n; i++) walk(children[i]!);
        if (found == null) found = pos;
        return;
      }
      for (const child of Array.from(node.childNodes)) {
        walk(child);
        if (found != null) return;
      }
    };

    walk(root);
    return found ?? pos;
  };

  const a = locate(range.startContainer, range.startOffset);
  const b = locate(range.endContainer, range.endOffset);
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

export function setDomCaretFromOffset(root: HTMLElement, offset: number): void {
  const target = Math.max(0, offset);
  let pos = 0;
  let found: { node: Node; offset: number } | null = null;

  const walk = (node: Node) => {
    if (found) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (target <= pos + text.length) {
        found = { node, offset: Math.max(0, target - pos) };
        return;
      }
      pos += text.length;
      return;
    }
    if (node.nodeName === 'BR') {
      if (target <= pos) {
        found = { node, offset: 0 };
        return;
      }
      pos += 1;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    for (const child of Array.from(node.childNodes)) {
      walk(child);
      if (found) return;
    }
  };

  walk(root);
  const range = document.createRange();
  if (found) {
    const hit = found as { node: Node; offset: number };
    if (hit.node.nodeName === 'BR' || hit.node.nodeType === Node.ELEMENT_NODE) {
      const parent = hit.node.parentNode ?? root;
      const index = Array.from(parent.childNodes).indexOf(hit.node as ChildNode);
      range.setStart(parent, Math.max(0, index));
    } else {
      range.setStart(hit.node, hit.offset);
    }
  } else {
    range.selectNodeContents(root);
    range.collapse(false);
  }
  range.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}
