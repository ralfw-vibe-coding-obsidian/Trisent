"use strict";

/*
 * Die Wörter eines Textes als Übersicht - das Wörterbuch zu diesem Text.
 *
 * Der Teil ohne Obsidian: sammeln, filtern, ordnen. Gezeichnet wird in
 * view.js (Reiter "Words"). Geprüft in tests/reader-words.test.js.
 *
 * Ein Wort steht einmal da, auch wenn es zehnmal vorkommt - mit den
 * Formen, in denen es in diesem Text steht, und wie oft. Wendungen über
 * mehrere Wörter gehören dazu; sie sind ja gerade das, was man sonst
 * übersieht.
 *
 * Geordnet wird alphabetisch nach der Spalte, die vorn steht. Was die
 * Person schon in ihren Index genommen hat, steht als eigene Gruppe
 * zuerst.
 */

const STATUSES = ['unknown', 'learning', 'familiar', 'known'];

/* Alle Wörter eines Textes.

   data:       das Paket (paragraphs[].sentences[].units/phrases)
   dictionary: Schlüssel -> Word entry (lemma, partOfSpeech, gloss)
   statusOf:   Schlüssel -> Lernstand, ohne Eintrag 'unknown'
   indexed:    Set der Schlüssel im Index

   Liefert [{ key, lemma, partOfSpeech, gloss, forms, count, status,
   indexed, phrase }] in der Reihenfolge des ersten Vorkommens. */
function collectWords(data, dictionary, statusOf, indexed) {
  const dict = dictionary || {};
  const status = typeof statusOf === 'function' ? statusOf : () => 'unknown';
  const inIndex = indexed || new Set();
  const byKey = new Map();

  const note = (key, surface, fallback, phrase) => {
    if (!key) return;
    let row = byKey.get(key);
    if (!row) {
      const entry = dict[key] || {};
      const parts = String(key).split(':');
      row = {
        key: key,
        lemma: entry.lemma || fallback.lemma || parts[1] || key,
        partOfSpeech: entry.partOfSpeech || fallback.partOfSpeech || parts[2] || '',
        gloss: entry.gloss || fallback.gloss || '',
        forms: [],
        count: 0,
        status: STATUSES.includes(status(key)) ? status(key) : 'unknown',
        indexed: inIndex.has(key),
        phrase: Boolean(phrase)
      };
      byKey.set(key, row);
    }
    row.count += 1;
    const form = String(surface || '').trim();
    if (form && !row.forms.some((other) => other.toLowerCase() === form.toLowerCase())) {
      row.forms.push(form);
    }
  };

  for (const paragraph of (data && data.paragraphs) || []) {
    for (const sentence of paragraph.sentences || []) {
      const source = String(sentence.source || '');
      for (const unit of sentence.units || []) {
        if (!unit || !unit.key) continue;
        const surface = unit.surface
          || (Number.isInteger(unit.start) && Number.isInteger(unit.end) ? source.slice(unit.start, unit.end) : '');
        note(unit.key, surface, unit, false);
      }
      for (const phrase of sentence.phrases || []) {
        if (!phrase || !phrase.key) continue;
        note(phrase.key, phrase.surface || '', phrase, true);
      }
    }
  }
  return [...byKey.values()];
}

/* Nur die gewählten Lernstände. Nichts gewählt heißt: alles. */
function filterWords(rows, statuses) {
  const wanted = (statuses || []).filter((status) => STATUSES.includes(status));
  if (wanted.length === 0) return rows.slice();
  return rows.filter((row) => wanted.includes(row.status));
}

/* Erst die Wörter im Index, dann der Rest - jeweils alphabetisch nach
   der Spalte, die vorn steht: 'foreign' nach der Grundform, 'native'
   nach der Übersetzung. Ohne Übersetzung ans Ende ihrer Gruppe. */
function sortWords(rows, first) {
  const byNative = first === 'native';
  const label = (row) => (byNative ? row.gloss : row.lemma) || '';
  return rows.slice().sort((a, b) => {
    if (a.indexed !== b.indexed) return a.indexed ? -1 : 1;
    const la = label(a);
    const lb = label(b);
    if (!la !== !lb) return la ? -1 : 1;
    return la.localeCompare(lb, undefined, { sensitivity: 'base' })
      || String(a.lemma).localeCompare(String(b.lemma), undefined, { sensitivity: 'base' });
  });
}

module.exports = { STATUSES, collectWords, filterWords, sortWords };
