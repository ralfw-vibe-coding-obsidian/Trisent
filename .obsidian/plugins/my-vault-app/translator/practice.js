"use strict";

/*
 * Übersetzen üben - die Regeln, ohne Obsidian.
 *
 * Eine Sitzung legt Sätze vor wie Karten: oben zwei Sätze davor aus der
 * Geschichte, in der Fremdsprache, als Zusammenhang; darunter der Satz in
 * der Muttersprache. Die Person schreibt oder spricht ihn in der
 * Fremdsprache, die KI urteilt.
 *
 * Es gibt KEINE geplante Wiedervorlage und keinen Berg. Nur zwei Wege:
 *   - zufällige Sätze aus einer Geschichte
 *   - die schwierigsten Sätze, über alle Geschichten
 *
 * Je Satz wird die Folge der Versuche gemerkt, als Zeichen, die man beim
 * Hineinschauen ohne Erklärung versteht:
 *
 *   ✗  nicht bedeutungsgleich
 *   ✓  bedeutungsgleich
 *   ★  bedeutungsgleich und sogar wortgleich mit dem Original
 *
 * Dreimal HINTEREINANDER richtig (✓ oder ★) heißt: Der Satz sitzt, er
 * kommt ins Archiv und wird nicht mehr vorgelegt. Ein Satz, den die
 * Person ausschließt, ist ebenso archiviert - er zählt aber nicht als
 * Versuch.
 *
 * Wie bei flashcards/schedule.js: reine Funktionen, geprüft in
 * tests/translator-practice.test.js. Ein Fehler hier zeigte sich erst
 * nach Wochen - als Satz, der nie wiederkommt, oder als einer, der nie
 * verschwindet.
 */

const MARK = { wrong: '✗', correct: '✓', exact: '★' };

/* Wie viele richtige Versuche hintereinander einen Satz ins Archiv
   bringen. */
const STREAK_TO_ARCHIVE = 3;

/* Die wählbaren Längen einer Sitzung. Weniger als fünf lohnt nicht -
   wer mehr will, macht eine zweite. */
const SIZES = [5, 7, 10];

/* Wie viele Sätze davor als Zusammenhang dastehen. */
const CONTEXT = 2;

/* "✓✗★" -> ['correct', 'wrong', 'exact']. Was kein bekanntes Zeichen
   ist, wird überlesen - von Hand verunglückt ist nicht falsch. */
function readMarks(value) {
  const out = [];
  for (const char of Array.from(String(value == null ? '' : value))) {
    if (char === MARK.wrong) out.push('wrong');
    else if (char === MARK.correct) out.push('correct');
    else if (char === MARK.exact) out.push('exact');
  }
  return out;
}

function writeMarks(marks) {
  return (marks || []).map((mark) => MARK[mark] || '').join('');
}

/* Einen Versuch anhängen. */
function addMark(value, result) {
  return writeMarks(readMarks(value).concat([result]));
}

function isRight(mark) {
  return mark === 'correct' || mark === 'exact';
}

/* Was die Folge eines Satzes sagt. */
function statsOf(value) {
  const marks = readMarks(value);
  const right = marks.filter(isRight).length;
  const tail = marks.slice(-STREAK_TO_ARCHIVE);
  return {
    seen: marks.length,
    right: right,
    wrong: marks.length - right,
    /* Die letzten drei alle richtig - "dreimal in einer Reihe". */
    settled: tail.length === STREAK_TO_ARCHIVE && tail.every(isRight)
  };
}

/* Wird dieser Satz nicht mehr vorgelegt? */
function isArchived(value, excluded) {
  return Boolean(excluded) || statsOf(value).settled;
}

/* Wie schwer ein Satz der Person fällt - für "The hardest". Null heißt:
   gehört nicht dazu (nie gesehen, nie gescheitert, oder archiviert).

   Vorn steht, woran sie am häufigsten scheitert, gemessen am Anteil.
   Bei gleichem Anteil der, an dem sie öfter gescheitert ist: 4 von 8
   sagt mehr als 1 von 2. */
function hardness(value, excluded) {
  if (isArchived(value, excluded)) return null;
  const stats = statsOf(value);
  if (stats.wrong === 0) return null;
  return { share: stats.wrong / stats.seen, wrong: stats.wrong };
}

function compareHardness(a, b) {
  if (b.share !== a.share) return b.share - a.share;
  return b.wrong - a.wrong;
}

/* Zum Vergleich mit dem Original: ohne Groß und klein, ohne Akzente,
   ohne Satzzeichen. Beim Einsprechen kommt nichts davon verlässlich an -
   es darf das Urteil nicht ändern. */
function plain(text) {
  return String(text == null ? '' : text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase()
    .replace(/[’'`´]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Wortgleich mit dem Original - das Sternchen obendrauf. */
function isExact(answer, reference) {
  const a = plain(answer);
  return a.length > 0 && a === plain(reference);
}

/* Das Ergebnis eines Versuchs aus dem Urteil der KI und dem Vergleich. */
function resultOf(correct, answer, reference) {
  if (!correct) return 'wrong';
  return isExact(answer, reference) ? 'exact' : 'correct';
}

/* Fisher-Yates mit hereingereichtem Zufall, damit es sich prüfen lässt. */
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

/* Die Sätze einer Geschichte der Reihe nach, jeder mit den Schlüsseln
   seiner Vorgänger als Zusammenhang.

   sentences: [{ id, ... }] in Lesereihenfolge
   textKey:   was die Geschichte eindeutig macht (ihr Ordner)

   Liefert [{ key, text, index, sentence, context: [sentence, ...],
   contextKeys: [...] }]. */
function storyItems(textKey, sentences) {
  const list = Array.isArray(sentences) ? sentences : [];
  return list.map((sentence, index) => {
    const before = list.slice(Math.max(0, index - CONTEXT), index);
    return {
      key: textKey + '#' + sentence.id,
      text: textKey,
      index: index,
      sentence: sentence,
      context: before,
      contextKeys: before.map((other) => textKey + '#' + other.id)
    };
  });
}

/* Woraus eine Sitzung zieht.

   Vorgemerkt werden so viele Sätze, wie die Sitzung lang ist:
   zufällig gemischt - oder die schwersten, untereinander gemischt.
   Dahinter liegt ein Vorrat (der Rest), falls ein Satz ausgeschlossen
   wird und ein anderer an seine Stelle treten muss.

   Die eine Bedingung: Kein Satz darf abgefragt werden, nachdem er auf
   einer früheren Karte schon als Zusammenhang dastand - sonst hätte die
   Person die Lösung eben gelesen. Erfüllt wird sie über die REIHENFOLGE,
   nicht durch Weglassen: Stehen zwei vorgemerkte Sätze nah beieinander,
   kommt der frühere zuerst. Weglassen fraß bei kurzen Geschichten fast
   alles - von fünf Sätzen blieben zwei.

   Bei einer kurzen Geschichte, die ganz drankommt, heißt das: der Reihe
   nach. Bei einer langen bleibt es zufällig. Aus dem Vorrat wird nur
   genommen, was noch nirgends als Zusammenhang stand. */
class Draw {
  constructor(items, options) {
    const settings = options || {};
    const random = settings.random;
    const size = Math.max(Math.trunc(Number(settings.size) || 0), 0) || items.length;

    const order = settings.mode === 'hardest' ? items.slice() : shuffle(items, random);
    this.planned = shuffle(order.slice(0, size), random);
    this.reserve = order.slice(size);
    this.shown = new Set();
  }

  next() {
    const waiting = new Set(this.planned.map((item) => item.key));

    /* Der erste vorgemerkte, in dessen Zusammenhang kein anderer
       vorgemerkter mehr wartet. Den gibt es immer: Der früheste in der
       Geschichte hat keinen wartenden Vorgänger. */
    let at = this.planned.findIndex((item) =>
      !(item.contextKeys || []).some((key) => waiting.has(key) && key !== item.key));
    if (at < 0 && this.planned.length > 0) at = 0;

    let item = null;
    if (at >= 0) {
      item = this.planned.splice(at, 1)[0];
    } else {
      const from = this.reserve.findIndex((other) => !this.shown.has(other.key));
      if (from < 0) {
        this.reserve = [];
        return null;
      }
      item = this.reserve.splice(from, 1)[0];
    }

    this.shown.add(item.key);
    for (const key of item.contextKeys || []) this.shown.add(key);
    return item;
  }
}

/* Der Ablauf einer Sitzung: welche Karte dran ist, wann Schluss ist.
   Schreiben tut sie nicht - sie sagt nur, was festzuhalten ist. */
class Session {
  constructor(draw, size) {
    this.draw = draw;
    this.size = Math.max(Math.trunc(Number(size) || 0), 1);
    this.results = [];
    this.excluded = 0;
    this.card = draw.next();
  }

  get done() {
    return !this.card || this.results.length >= this.size;
  }

  /* Die wievielte Karte, 1-basiert. */
  get position() {
    return Math.min(this.results.length + 1, this.size);
  }

  get right() {
    return this.results.filter((entry) => isRight(entry.result)).length;
  }

  /* Ein Versuch ist geprüft. Weiter geht es erst mit next() - dazwischen
     liegt die Rückseite mit Urteil und Lösung. */
  record(result) {
    if (!this.card) return null;
    const entry = { item: this.card, result: result };
    this.results.push(entry);
    return entry;
  }

  next() {
    this.card = this.results.length >= this.size ? null : this.draw.next();
    return this.card;
  }

  /* Ausgeschlossen: zählt nicht als Versuch, und an seine Stelle tritt
     der nächste Satz. */
  exclude() {
    if (!this.card) return null;
    const item = this.card;
    this.excluded++;
    this.card = this.draw.next();
    return item;
  }
}

module.exports = {
  MARK, SIZES, CONTEXT, STREAK_TO_ARCHIVE,
  readMarks, writeMarks, addMark, isRight, statsOf, isArchived,
  hardness, compareHardness, plain, isExact, resultOf, shuffle,
  storyItems, Draw, Session
};
