/** Id helper in the same style as Speak Fiction's `uid`. */

export function createIdFactory(prefix = 'id'): () => string {
  let n = 0;
  return () => {
    n = (n + 1) % 1_000_000;
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}_${Date.now().toString(36)}_${n.toString(36)}_${rand}`;
  };
}

export function sequenceIds(prefix = 'id'): () => string {
  let n = 0;
  return () => `${prefix}_${++n}`;
}
