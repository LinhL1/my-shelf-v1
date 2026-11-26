import type { Book } from '../types';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Trims and collapses whitespace; the user's own capitalisation is kept. */
export function cleanTag(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

/** Tags are the same when they differ only in case or accents. */
function tagKey(tag: string) {
  return cleanTag(tag).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export function hasTag(tags: readonly string[], tag: string) {
  const key = tagKey(tag);
  return tags.some((t) => tagKey(t) === key);
}

/**
 * Adds each tag in `text` (comma-separated) that is not already there. A tag already used on
 * another book is spelled the way it is there, so “tbr” joins the existing “TBR”.
 */
export function addTags(tags: readonly string[], text: string, known: readonly string[] = []) {
  const next = [...tags];
  for (const part of text.split(',')) {
    const tag = cleanTag(part);
    if (!tag || hasTag(next, tag)) continue;
    next.push(known.find((k) => tagKey(k) === tagKey(tag)) ?? tag);
  }
  return next;
}

export function removeTag(tags: readonly string[], tag: string) {
  const key = tagKey(tag);
  return tags.filter((t) => tagKey(t) !== key);
}

/** Tags from elsewhere in the library worth offering: not yet chosen, and containing what is typed. */
export function suggestTags(known: readonly string[], chosen: readonly string[], draft: string) {
  const typed = tagKey(draft);
  return known.filter((tag) => !hasTag(chosen, tag) && tagKey(tag).includes(typed));
}

/** Every tag in use, alphabetically, with how many books carry it. */
export function collectTags(books: readonly Book[]) {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const book of books) {
    for (const tag of book.tags) {
      const key = tagKey(tag);
      const entry = counts.get(key);
      if (entry) entry.count++;
      else counts.set(key, { tag, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => collator.compare(a.tag, b.tag));
}
