/**
 * Names of people: the title "Sheikh" is added to members of the Al Thani family, in English or in Arabic.
 * One function, used everywhere a name is saved or read, so a person's name looks the same on their profile,
 * in the admin dashboard and in the database.
 */

// Already has a title: never add a second one (Sheikh, Sheikha, الشيخ, الشيخة, شيخ ...)
const HAS_TITLE = /^\s*(?:sheikh|shaikh|sheikha|shaykh|الشيخة|الشيخ|شيخة|شيخ)(?=[\s.,،-]|$)/i;

// Al Thani in English: "Al Thani", "Al-Thani", "AlThani"
const AL_THANI_EN = /\bal[\s\-.]*thani\b/i;

// Al Thani in Arabic: "آل ثاني", "ال ثاني", "الثاني" (a word of its own, so "الثانية" does not match)
const AL_THANI_AR = /(?:^|\s)[آا]ل[\s‌\-]*ثاني(?=\s|$)/;

const ARABIC_LETTER = /[؀-ۿ]/;

/** The name with "Sheikh" (or "الشيخ" for an Arabic name) in front when the family is Al Thani. Safe to call twice. */
export function withTitle(name: string): string {
  const clean = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!clean || HAS_TITLE.test(clean)) return clean;
  if (!AL_THANI_EN.test(clean) && !AL_THANI_AR.test(clean)) return clean;
  return `${ARABIC_LETTER.test(clean) ? 'الشيخ' : 'Sheikh'} ${clean}`;
}

/** The letter for a round avatar: the first letter of the name itself, not of the title. */
export function initialOf(name: string): string {
  const clean = String(name ?? '').trim().replace(HAS_TITLE, '').trim();
  const first = Array.from(clean)[0];
  return first ? first.toUpperCase() : '?';
}
