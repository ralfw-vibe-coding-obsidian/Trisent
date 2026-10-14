"use strict";

/*
 * Der Lückensatz - die Regeln, ohne Obsidian.
 *
 * Die Person sieht den fremdsprachigen Satz mit ein bis drei Lücken und
 * den Satz in ihrer Muttersprache als Hilfe. Darunter liegen Wörter zur
 * Auswahl - ALLE in einem gemeinsamen Topf, keiner Lücke zugeordnet: Sie
 * muss selbst überlegen, was wohin gehört.
 *
 * Welche Wörter fehlen: bevorzugt die, die sie noch lernt oder in ihren
 * Index genommen hat, und Inhaltswörter vor kleinen Bindewörtern. Nie
 * Eigennamen - die verraten nichts über die Sprache.
 *
 * Die falschen Angebote kommen zuerst aus demselben Wort: andere Formen
 * und die Grundform ("habite" - "habites", "habiter"). So übt die
 * Auswahl genau das, worauf es ankommt. Erst wenn es davon zu wenige
 * gibt, Wörter derselben Art.
 *
 * Geprüft in tests/exercises-gaps.test.js.
 */

const CONTENT = ['NOUN', 'VERB', 'AUX', 'ADJ', 'ADV', 'PRON'];
const NEVER = ['PROPN', 'PUNCT', 'SYM', 'NUM', 'X'];

/* Wie dringend ein Wort geübt werden will - kleiner ist dringender. */
const URGENCY = { indexed: 0, unknown: 1, learning: 2, familiar: 3, known: 4 };

/* Zum Vergleichen und Anzeigen: klein, gerade Apostrophe. */
function plainWord(text) {
  return String(text || '').toLocaleLowerCase().replace(/’/g, "'").trim();
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

/* Wie viele Lücken ein Satz verträgt. */
function gapCount(words) {
  if (words <= 4) return 1;
  if (words <= 9) return 2;
  return 3;
}

function unitsOf(sentence) {
  const source = String((sentence && sentence.source) || '');
  return ((sentence && sentence.units) || [])
    .filter((unit) => unit && Number.isInteger(unit.start) && Number.isInteger(unit.end) && unit.end > unit.start)
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((unit) => Object.assign({}, unit, { text: source.slice(unit.start, unit.end) }));
}

/* Welche Wörter zu Lücken werden - als Stellen in unitsOf(). Nicht zwei
   nebeneinander, solange es anders geht: Zwei Lücken in Folge lassen
   nichts mehr übrig, woran man sich halten kann. */
function pickGaps(units, statusOf, indexed, random) {
  const status = typeof statusOf === 'function' ? statusOf : () => 'unknown';
  const inIndex = indexed || new Set();
  const order = shuffle(units.map((unit, index) => index), random);

  const candidates = order
    .filter((index) => !NEVER.includes(units[index].partOfSpeech) && units[index].key)
    .map((index) => {
      const unit = units[index];
      const urgency = inIndex.has(unit.key) ? URGENCY.indexed : (URGENCY[status(unit.key)] ?? URGENCY.unknown);
      return { index: index, urgency: urgency, content: CONTENT.includes(unit.partOfSpeech) ? 0 : 1 };
    })
    .sort((a, b) => (a.urgency - b.urgency) || (a.content - b.content));

  const wanted = Math.min(gapCount(units.length), candidates.length);
  const chosen = [];
  for (const candidate of candidates) {
    if (chosen.length >= wanted) break;
    if (chosen.some((index) => Math.abs(index - candidate.index) === 1)) continue;
    chosen.push(candidate.index);
  }
  /* Ging es nicht ohne Nachbarn, dann eben mit. */
  for (const candidate of candidates) {
    if (chosen.length >= wanted) break;
    if (!chosen.includes(candidate.index)) chosen.push(candidate.index);
  }
  return chosen.sort((a, b) => a - b);
}

/* Falsche Angebote für eine Lücke: andere Formen desselben Wortes und
   seine Grundform; reicht das nicht, Wörter derselben Art.

   entry:  der Word entry des gesuchten Wortes (lemma, forms)
   others: [{ text, partOfSpeech }] - Wörter, aus denen aufgefüllt wird
   taken:  Set der schon vergebenen Angebote (klein geschrieben) */
function distractorsFor(answer, partOfSpeech, entry, others, taken, wanted, random) {
  const out = [];
  const add = (text) => {
    const word = plainWord(text);
    if (!word || word === plainWord(answer) || taken.has(word) || out.includes(word)) return;
    if (/\s/.test(word)) return;
    out.push(word);
  };

  const own = [].concat((entry && entry.forms) || [], entry && entry.lemma ? [entry.lemma] : []);
  for (const form of shuffle(own, random)) {
    if (out.length >= wanted) break;
    add(form);
  }
  const sameKind = shuffle((others || []).filter((other) => other.partOfSpeech === partOfSpeech), random);
  for (const other of sameKind) {
    if (out.length >= wanted) break;
    add(other.text);
  }
  for (const other of shuffle(others || [], random)) {
    if (out.length >= wanted) break;
    add(other.text);
  }
  return out;
}

/* Eine Aufgabe: der Satz in Stücken (Text und Lücken), die Lösungen,
   und der gemischte Topf mit Angeboten.

   dictionary: Schlüssel -> Word entry
   others:     Wörter zum Auffüllen der Angebote

   Liefert { parts: [{ text } | { gap: n }], gaps: [{ answer, key }],
   options: [{ id, text }] }. */
function buildGaps(sentence, dictionary, statusOf, indexed, others, random) {
  const source = String((sentence && sentence.source) || '');
  const units = unitsOf(sentence);
  const chosen = pickGaps(units, statusOf, indexed, random);

  const parts = [];
  const gaps = [];
  let at = 0;
  for (const index of chosen) {
    const unit = units[index];
    if (unit.start > at) parts.push({ text: source.slice(at, unit.start) });
    parts.push({ gap: gaps.length });
    gaps.push({ answer: plainWord(unit.text), key: unit.key, partOfSpeech: unit.partOfSpeech });
    at = unit.end;
  }
  if (at < source.length) parts.push({ text: source.slice(at) });

  /* Erst alle Lösungen in den Topf, dann je Lücke zwei falsche. */
  const taken = new Set(gaps.map((gap) => gap.answer));
  const pool = gaps.map((gap) => gap.answer);
  for (const gap of gaps) {
    const wrong = distractorsFor(
      gap.answer, gap.partOfSpeech, (dictionary || {})[gap.key], others, taken, 2, random
    );
    for (const word of wrong) {
      taken.add(word);
      pool.push(word);
    }
  }
  const options = shuffle(pool, random).map((text, index) => ({ id: 'o' + index, text: text }));
  return { parts: parts, gaps: gaps, options: options };
}

/* Stimmt, was in den Lücken steht? filled: je Lücke der gewählte Text
   (oder null). Liefert { correct, right: [true/false je Lücke] }. */
function checkGaps(filled, gaps) {
  const right = gaps.map((gap, index) => plainWord(filled[index]) === gap.answer);
  return { correct: right.every(Boolean), right: right };
}

module.exports = { gapCount, unitsOf, pickGaps, distractorsFor, buildGaps, checkGaps, plainWord };
