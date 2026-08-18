/** Small shared helpers. */

let counter = 0;

/** Reasonably-unique id without pulling in a uuid dependency. */
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${rand}`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'untitled';
}

/** Capitalize the first alphabetical character, leaving the rest untouched. */
export function capitalizeFirst(text: string): string {
  return text.replace(/[a-z]/, (c) => c.toUpperCase());
}
