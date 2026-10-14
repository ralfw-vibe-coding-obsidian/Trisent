"use strict";

/*
 * Die richtige Form - die Regeln, ohne Obsidian.
 *
 * Im fremdsprachigen Satz fehlen ein oder zwei Wörter; dahinter steht
 * ihre Grundform: "Julie ___ (habiter) à Paris." Die Person tippt die
 * Form, die hineingehört: habite. Geübt wird genau das, woran es beim
 * getippten Übersetzen hakt - Endungen, Angleichung, Artikel.
 *
 * Zur Lücke wird nur, was im Satz anders aussieht als seine Grundform:
 * Bei "Paris" oder "avec" gäbe es nichts zu beugen. Verben zuerst, dann
 * Adjektive, dann der Rest; Wörter aus dem Index und solche, die man
 * noch lernt, vor den anderen.
 *
 * Geprüft wird ohne Groß und klein und ohne Akzente - wie im Translator.
 * Fehlt nur ein Akzent, zählt es als richtig, und die App sagt es dazu.
 *
 * Geprüft in tests/exercises-forms.test.js.
 */

const { unitsOf } = require('./gaps.js');

const NEVER = ['PROPN', 'PUNCT', 'SYM', 'NUM', 'X'];
const KIND = { VERB: 0, AUX: 0, ADJ: 1, NOUN: 2, DET: 3, PRON: 3 };
const URGENCY = { indexed: 0, unknown: 1, learning: 2, familiar: 3, known: 4 };

/* Ohne Groß und klein, gerade Apostrophe. */
function lower(text) {
  return String(text || '').toLocaleLowerCase().replace(/’/g, "'").trim();
}

/* Zusätzlich ohne Akzente. */
function bare(text) {
  return lower(text).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function shuffle(items, random) {
  const rnd = typeof random === 'function' ? random : Math.random;
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return out;
}

/* Die Grundform eines Wortes: aus dem Paket, sonst aus dem Wörterbuch,
   sonst aus dem Schlüssel. */
function lemmaOf(unit, dictionary) {
  const entry = (dictionary || {})[unit.key] || {};
  return unit.lemma || entry.lemma || String(unit.key || '').split(':')[1] || '';
}

/* Welche Wörter zu Lücken werden - als Stellen in unitsOf(). */
function pickForms(units, dictionary, statusOf, indexed, random) {
  const status = typeof statusOf === 'function' ? statusOf : () => 'unknown';
  const inIndex = indexed || new Set();

  const candidates = shuffle(units.map((unit, index) => index), random)
    .filter((index) => {
      const unit = units[index];
      if (!unit.key || NEVER.includes(unit.partOfSpeech) || !(unit.partOfSpeech in KIND)) return false;
      const lemma = lemmaOf(unit, dictionary);
      return lemma && bare(lemma) !== bare(unit.text);
    })
    .map((index) => {
      const unit = units[index];
      return {
        index: index,
        urgency: inIndex.has(unit.key) ? URGENCY.indexed : (URGENCY[status(unit.key)] ?? URGENCY.unknown),
        kind: KIND[unit.partOfSpeech]
      };
    })
    .sort((a, b) => (a.kind - b.kind) || (a.urgency - b.urgency));

  const wanted = Math.min(units.length <= 6 ? 1 : 2, candidates.length);
  const chosen = [];
  for (const candidate of candidates) {
    if (chosen.length >= wanted) break;
    if (chosen.some((index) => Math.abs(index - candidate.index) === 1)) continue;
    chosen.push(candidate.index);
  }
  return chosen.sort((a, b) => a - b);
}

/* Eine Aufgabe: der Satz in Stücken (Text und Lücken) und je Lücke die
   gesuchte Form und ihre Grundform. Ohne Lücke: gaps ist leer. */
function buildForms(sentence, dictionary, statusOf, indexed, random) {
  const source = String((sentence && sentence.source) || '');
  const units = unitsOf(sentence);
  const chosen = pickForms(units, dictionary, statusOf, indexed, random);

  const parts = [];
  const gaps = [];
  let at = 0;
  for (const index of chosen) {
    const unit = units[index];
    if (unit.start > at) parts.push({ text: source.slice(at, unit.start) });
    parts.push({ gap: gaps.length });
    gaps.push({ answer: unit.text, lemma: lemmaOf(unit, dictionary), key: unit.key });
    at = unit.end;
  }
  if (at < source.length) parts.push({ text: source.slice(at) });
  return { parts: parts, gaps: gaps };
}

/* Stimmt die getippte Form? right: ohne Akzente gleich. accent: richtig,
   aber ein Akzent fehlt oder steht falsch - das sagt die App dazu. */
function checkForm(typed, answer) {
  const right = bare(typed) !== '' && bare(typed) === bare(answer);
  return { right: right, accent: right && lower(typed) !== lower(answer) };
}

module.exports = { lemmaOf, pickForms, buildForms, checkForm, bare };
