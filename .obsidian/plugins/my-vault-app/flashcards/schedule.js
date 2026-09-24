"use strict";

/*
 * Wann eine Karte wieder drankommt.
 *
 * Diese Datei rechnet nur - sie kennt weder Obsidian noch Dateien noch
 * die Oberfläche. Das ist Absicht: Ein Fehler in dieser Rechnung fällt
 * sonst erst in drei Wochen auf, wenn eine Karte zum falschen Zeitpunkt
 * erscheint oder gar nicht mehr. Von Hand ist das kaum zu prüfen.
 *
 * Geprüft wird stattdessen in tests/flashcards-schedule.test.js.
 */

/* Fibonacci, in Tagen. Der letzte Eintrag heißt "nie wieder".

   Der Rhythmus ist einstellbar, deshalb steht er nicht als Konstante da,
   sondern hinter rhythm(). Wer ihn ändert, ändert damit auch die Zahl der
   Stufen - eine kürzere Liste heißt weniger Stufen, und normalize() holt
   Karten, die schon höher standen, still auf die neue Spitze zurück. */
const DEFAULT_RHYTHM = [1, 1, 2, 3, 5, 8, 13, 21, 34, 9999];

let RHYTHM = DEFAULT_RHYTHM.slice();

function rhythm() {
  return RHYTHM;
}

function maxLevel() {
  return RHYTHM.length - 1;
}

/* Aus dem, was in den Einstellungen steht, eine brauchbare Folge machen -
   oder null, wenn es keine ist. Verlangt werden mindestens zwei Stufen,
   ganze Tage, und keine Null: Eine Karte, die nach null Tagen wiederkommt,
   käme heute noch einmal und liefe im Kreis. */
function parseRhythm(input) {
  const parts = String(input == null ? '' : input)
    .split(/[\s,;]+/)
    .filter((part) => part.length > 0);

  if (parts.length < 2) return null;

  const days = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const value = Number(part);
    if (!(value >= 1) || value > 100000) return null;
    days.push(value);
  }
  return days;
}

function formatRhythm(days) {
  return (days || RHYTHM).join(', ');
}

/* Den Rhythmus setzen. Unbrauchbares wird abgewiesen, nicht zurechtgebogen -
   sonst lernte die Person nach einer Folge, die sie nie eingegeben hat. */
function configure(input) {
  const days = Array.isArray(input) ? parseRhythm(input.join(' ')) : parseRhythm(input);
  if (!days) return false;
  RHYTHM = days;
  return true;
}

/* Woraus eine Sitzung ihre Karten zieht. */
const SOURCES = [
  { id: 'due', label: 'Due' },
  { id: 'new', label: 'New' },
  { id: 'hard', label: 'Hardest' }
];

/* Welcher Tag heute ist und wie man mit Tagen rechnet, steht an EINER
   Stelle für die ganze App: core/calendar.js. Hier wurde es früher selbst
   ausgerechnet - mit dem Datum der Weltzeit, sodass eine Karte in Hamburg
   erst um 2 Uhr nachts fällig wurde statt um Mitternacht. */
const { today, addDays, daysBetween } = require('../core/calendar.js');

/* Eine Karte auf einen brauchbaren Stand bringen - auch wenn jemand von
   Hand etwas Unsinniges in die Notiz geschrieben hat. */
function normalize(card) {
  const level = Math.min(Math.max(Math.trunc(Number(card.level) || 0), 0), maxLevel());
  return {
    level: level,
    seen: Math.max(Math.trunc(Number(card.seen) || 0), 0),
    wrong: Math.max(Math.trunc(Number(card.wrong) || 0), 0),
    due: typeof card.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(card.due) ? card.due : null
  };
}

/* Die Bewertung einer Karte. Liefert den neuen Stand, ohne die alte zu
   verändern.

   bekannt:   Wiedervorlage = heute + Rhythmus des AKTUELLEN Levels,
              danach eine Stufe höher (bei 9 ist Schluss).
   unbekannt: morgen wieder, zurück auf Stufe 1.
   nochmal:   ändert nichts - die Karte geht nur ans Ende des Stapels. */
function rate(card, answer, day) {
  const state = normalize(card);
  const now = day || today();

  if (answer === 'again') return state;

  if (answer === 'known') {
    return {
      level: Math.min(state.level + 1, maxLevel()),
      seen: state.seen + 1,
      wrong: state.wrong,
      due: addDays(now, RHYTHM[state.level])
    };
  }

  return {
    level: 1,
    seen: state.seen + 1,
    wrong: state.wrong + 1,
    due: addDays(now, 1)
  };
}

function isNew(card) {
  return normalize(card).seen === 0;
}

function isDue(card, day) {
  const state = normalize(card);
  if (state.seen === 0) return false;
  if (!state.due) return true;
  return state.due <= (day || today());
}

/* Den Stapel für eine Sitzung zusammenstellen.

   Reicht die gewählte Quelle nicht für den gewünschten Umfang, wird
   aufgefüllt: Fällige mit Neuen, alles andere bleibt, wie es ist. */
function pick(cards, source, size, day) {
  const now = day || today();
  const limit = Math.max(Math.trunc(Number(size) || 0), 0);
  if (limit === 0) return [];

  /* Neue in der Reihenfolge, in der sie hinzugekommen sind - was man
     sich zuerst vorgenommen hat, kommt zuerst dran. Die Reihenfolge der
     Dateien im Ordner wäre zufällig und sähe trotzdem nach einer
     Reihenfolge aus. */
  if (source === 'new') {
    return cards
      .filter(isNew)
      .slice()
      .sort((a, b) => String(a.added || '').localeCompare(String(b.added || '')))
      .slice(0, limit);
  }

  if (source === 'hard') {
    return cards
      .filter((card) => normalize(card).wrong > 0)
      .slice()
      .sort((a, b) => normalize(b).wrong - normalize(a).wrong)
      .slice(0, limit);
  }

  /* Fällige zuerst, die am längsten überfälligen voran. */
  const due = cards
    .filter((card) => isDue(card, now))
    .slice()
    .sort((a, b) => String(normalize(a).due || '').localeCompare(String(normalize(b).due || '')));

  if (due.length >= limit) return due.slice(0, limit);

  const chosen = new Set(due);
  const fresh = cards.filter((card) => isNew(card) && !chosen.has(card));
  return due.concat(fresh.slice(0, limit - due.length));
}

/* Was in den nächsten Wochen auf einen zukommt: je Tag die Zahl der
   Karten, davor das Überfällige, dahinter alles Spätere.

   Neue Karten zählen nicht mit - sie haben keinen Termin, sie warten.
   Sie würden den ersten Balken aufblähen und den Blick auf das
   verstellen, worum es hier geht: ob sich ein Berg aufbaut. */
function timeline(cards, day, span) {
  const now = day || today();
  const width = Math.max(Math.trunc(Number(span) || 0), 1);

  const days = [];
  for (let i = 0; i < width; i++) days.push({ day: addDays(now, i), count: 0 });

  let over = 0;
  let later = 0;
  let fresh = 0;

  for (const card of cards) {
    const state = normalize(card);
    if (state.seen === 0) {
      fresh++;
      continue;
    }
    /* Ohne Datum ist eine gesehene Karte fällig - so liest es auch
       isDue(). Sie gehört damit zum Überfälligen. */
    if (!state.due) {
      over++;
      continue;
    }

    const offset = daysBetween(now, state.due);
    if (offset < 0) over++;
    else if (offset >= width) later++;
    else days[offset].count++;
  }

  return { over: over, days: days, later: later, fresh: fresh };
}

/* Wie hoch ein Balken des Zeitstrahls steht - 0 bis knapp unter 1.

   Nicht linear, sondern sättigend: n / (n + HALF). Unten ist die Kurve
   steil, oben flach. 10 und 30 Karten unterscheiden sich deutlich
   (33% gegen 60%), 150 und 170 kaum noch (88% gegen 90%) - und genau so
   liest man einen solchen Strahl auch: Ob an einem Tag zehn oder dreißig
   warten, entscheidet über den Abend. Ob hundertfünfzig oder
   hundertsiebzig, ist dieselbe schlechte Nachricht.

   Der Nebeneffekt ist, dass die Höhe nie über 1 geht. Es braucht also
   keinen Höchstwert, gegen den gemessen wird, und der Strahl sieht
   morgen nicht anders aus als heute, nur weil eine Spitze dazukam. */
const BAR_HALF = 20;

function barHeight(count, half) {
  const n = Math.max(Math.trunc(Number(count) || 0), 0);
  if (n === 0) return 0;
  const k = Math.max(Number(half) || BAR_HALF, 1);
  return n / (n + k);
}

/* Mischen. Der Zufall ist hereingereicht, damit ein Test ihn festhalten
   kann. */
function shuffle(items, random) {
  const roll = random || Math.random;
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(roll() * (i + 1));
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return out;
}

module.exports = {
  DEFAULT_RHYTHM, SOURCES,
  rhythm, maxLevel, parseRhythm, formatRhythm, configure,
  today, addDays, daysBetween, normalize,
  rate, isNew, isDue, pick, shuffle, timeline, barHeight, BAR_HALF
};
