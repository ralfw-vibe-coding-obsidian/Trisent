"use strict";

/*
 * Tags an Texten - der Teil ohne Obsidian.
 *
 * Die Person ordnet ihre Texte selbst: Ein Text kann beliebig viele Tags
 * tragen, "Paul et Julie", "A1", "alltag". Gefiltert wird so:
 *
 *   Suchwort im Titel  UND  (einer der gewählten Tags ODER ein anderer)
 *
 * Also "Paul" UND (#A1 ODER #alltag). Die Tags untereinander mit ODER,
 * weil man damit eine Auswahl zusammenstellt ("alles für heute Abend"),
 * statt sie mit jedem Tipp kleiner zu machen.
 *
 * Die Tags stehen in der Notiz des Textes unter `tags` - dort, wo
 * Obsidian sie ohnehin sucht. So tauchen sie auch in Obsidians eigener
 * Tag-Liste auf, und man kann sie dort von Hand ändern.
 */

/* Ein Tag, wie Obsidian ihn schreibt: ohne "#", ohne Leerzeichen.
   Leerzeichen werden zu Bindestrichen - "Paul et Julie" wäre sonst drei
   Tags oder keiner. Groß und klein bleibt, wie die Person es tippt;
   verglichen wird ohne Unterschied (siehe same). */
function cleanTag(value) {
  return String(value == null ? '' : value)
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, '-')
    .replace(/[,;]+/g, '')
    .replace(/^-+|-+$/g, '');
}

/* Zwei Tags sind derselbe, wenn sie sich nur in Groß und klein
   unterscheiden - so hält es auch Obsidian. */
function tagKey(tag) {
  return cleanTag(tag).toLocaleLowerCase();
}

/* Was in `tags` steht, als saubere Liste. Obsidian schreibt eine Liste;
   von Hand steht dort auch mal "a1, alltag" oder ein einzelnes Wort. */
function tagsOf(value) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string' ? value.split(/[,\s]+/) : [];

  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const tag = cleanTag(item);
    if (!tag || seen.has(tagKey(tag))) continue;
    seen.add(tagKey(tag));
    out.push(tag);
  }
  return out;
}

function hasTag(tags, tag) {
  const key = tagKey(tag);
  return tagsOf(tags).some((own) => tagKey(own) === key);
}

/* Einen Tag an- oder abwählen. Liefert die neue Liste. */
function toggleTag(tags, tag) {
  const list = tagsOf(tags);
  const clean = cleanTag(tag);
  if (!clean) return list;
  const key = tagKey(clean);
  return list.some((own) => tagKey(own) === key)
    ? list.filter((own) => tagKey(own) !== key)
    : list.concat([clean]);
}

/* Alle Tags aus mehreren Listen, ohne Doppelte, alphabetisch. Bei
   verschiedener Schreibweise gewinnt die erste. */
function allTags(lists) {
  const seen = new Map();
  for (const list of lists || []) {
    for (const tag of tagsOf(list)) {
      if (!seen.has(tagKey(tag))) seen.set(tagKey(tag), tag);
    }
  }
  return [...seen.values()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
}

/* Zum Suchen: ohne Groß und klein, ohne Akzente. "cafe" findet "café". */
function fold(text) {
  return String(text == null ? '' : text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase();
}

/* Passt ein Text zum Filter?

   text:   { title, subtitle, tags }
   filter: { query, tags } - query ein Suchwort, tags die gewählten.

   Das Suchwort muss im Titel stecken (oder in seiner Übersetzung - wer
   "Kino" sucht, meint "cinéma"). Sind Tags gewählt, muss der Text
   mindestens einen davon tragen. */
function matchesText(text, filter) {
  const query = fold(filter && filter.query).trim();
  if (query) {
    const where = fold((text && text.title) || '') + '\n' + fold((text && text.subtitle) || '');
    if (!where.includes(query)) return false;
  }

  const wanted = tagsOf(filter && filter.tags);
  if (wanted.length === 0) return true;
  const own = tagsOf(text && text.tags);
  return wanted.some((tag) => own.some((mine) => tagKey(mine) === tagKey(tag)));
}

module.exports = { cleanTag, tagKey, tagsOf, hasTag, toggleTag, allTags, fold, matchesText };
