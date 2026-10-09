"use strict";

/*
 * AUF EIS GELEGT (Oktober 2026).
 *
 * Der alte Translator: ein Text von vorn nach hinten, Satz für Satz, in
 * beiden Richtungen. Ersetzt durch das Üben in Sitzungen (translator/
 * view.js, practice.js). Diese Datei wird nicht mehr geladen - sie steht
 * in keiner Liste in main.js - und bleibt nur zum Nachschlagen liegen.
 * Die Pfade in ihren require() stimmen hier nicht mehr.
 */

/*
 * Was die Person über Sätze weiß.
 *
 * Gegenstück zum Wörterbuch: Dort steht, welche Wörter sitzen, hier,
 * wie ein Satz in welcher Richtung gelaufen ist. Eine Notiz je Text.
 *
 * Je Satz steht "richtig/Versuche", also `s003: 2/5`. Das ist die Form,
 * die man beim Hineinschauen ohne Erklärung versteht - und darum geht es
 * bei einer Vault als Datenbank.
 *
 * Die Antworten selbst werden NICHT aufgehoben. Nur, wie es ausging.
 */

const { now } = require('../core/calendar.js');

/* Die Notiz, in der das steht, gehört dem Text, nicht dem Translator -
   siehe learning/texts.js. Hier wird nur hineingeschrieben, wie die
   Sätze gelaufen sind. */
const { TEXTS_DIR } = require('../learning/texts.js');
const SENTENCES_DIR = TEXTS_DIR;

/* Die beiden Übungsrichtungen. "intoForeign" ist die schwerere: Wer in die
   Fremdsprache schreibt, muss sie wirklich können. */
const DIRECTIONS = [
  { id: 'intoForeign', short: '→ foreign' },
  { id: 'intoNative', short: '→ native' }
];

/* "2/5" -> { correct: 2, tries: 5 }. Verträgt auch eine blanke Zahl aus
   einer früheren Fassung und alles, was von Hand verunglückt ist. */
function readTally(value) {
  if (typeof value === 'number') return { correct: value, tries: value };

  const match = String(value || '').match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
  if (!match) return { correct: 0, tries: 0 };

  const correct = Number(match[1]);
  const tries = Number(match[2]);
  return { correct: correct, tries: Math.max(tries, correct) };
}

class SentenceKnowledge {
  constructor(app, library, texts) {
    this.app = app;
    this.library = library;
    this.texts = texts;
  }

  /* Eine Notiz je Text, benannt wie der Paketordner. */
  fileFor(language, packageFolder) {
    return this.texts.fileFor(language, packageFolder);
  }

  /* Wie ein Satz in einer Richtung gelaufen ist: { correct, tries }. */
  counts(language, packageFolder) {
    const file = this.fileFor(language, packageFolder);
    const empty = { intoForeign: {}, intoNative: {} };
    if (!file) return empty;

    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
    const out = { intoForeign: {}, intoNative: {} };
    for (const direction of Object.keys(out)) {
      const stored = fm[direction];
      if (!stored || typeof stored !== 'object') continue;
      for (const id of Object.keys(stored)) out[direction][id] = readTally(stored[id]);
    }
    return out;
  }

  /* Wie viele Sätze eines Textes in einer Richtung schon mindestens einmal
     saßen - die Zahl, die in der Textliste steht. */
  solved(language, packageFolder, direction) {
    const counts = this.counts(language, packageFolder)[direction] || {};
    let n = 0;
    for (const id of Object.keys(counts)) {
      if (counts[id].correct > 0) n += 1;
    }
    return n;
  }

  /* Einen Versuch vermerken, richtig oder falsch. Beide Zahlen wachsen nur -
     ein Satz, den man einmal konnte, bleibt gezählt. */
  async record(language, packageFolder, data, direction, sentenceId, correct) {
    const file = await this.texts.ensure(language, packageFolder, data);

    let tally;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      if (!fm[direction] || typeof fm[direction] !== 'object') fm[direction] = {};
      const before = readTally(fm[direction][sentenceId]);
      tally = {
        correct: before.correct + (correct ? 1 : 0),
        tries: before.tries + 1
      };
      fm[direction][sentenceId] = tally.correct + '/' + tally.tries;
      fm.updatedAt = now();
    });

    return tally;
  }
}

module.exports = { SentenceKnowledge, readTally, SENTENCES_DIR, DIRECTIONS };
