"use strict";

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

const { TFile, TFolder, normalizePath } = require('obsidian');
const { now } = require('../core/calendar.js');

const SENTENCES_DIR = 'sentences';

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
  constructor(app, library) {
    this.app = app;
    this.library = library;
  }

  folderPath(language) {
    return normalizePath(language.path + '/' + SENTENCES_DIR);
  }

  /* Eine Notiz je Text, benannt wie der Paketordner. */
  filePath(language, packageFolder) {
    return this.folderPath(language) + '/' + packageFolder.name + '.md';
  }

  fileFor(language, packageFolder) {
    const file = this.app.vault.getAbstractFileByPath(this.filePath(language, packageFolder));
    return file instanceof TFile ? file : null;
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
    const file = this.fileFor(language, packageFolder)
      || (await this.create(language, packageFolder, data));

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

  async create(language, packageFolder, data) {
    const folder = this.app.vault.getAbstractFileByPath(this.folderPath(language));
    if (!(folder instanceof TFolder)) await this.library.ensureFolder(this.folderPath(language));

    const lines = [
      '---',
      'type: sentences',
      'language: ' + language.code,
      'package: ' + (data.id || packageFolder.name),
      'title: ' + JSON.stringify(data.title || packageFolder.name),
      'intoForeign: {}',
      'intoNative: {}',
      '---',
      '',
      'Wie die Sätze dieses Textes gelaufen sind, je Richtung.',
      'Gelesen wird `richtig/Versuche` - `2/5` heißt: fünfmal versucht,',
      'zweimal richtig. Die Übersetzungen selbst werden nicht aufgehoben.',
      ''
    ];
    return this.app.vault.create(this.filePath(language, packageFolder), lines.join('\n'));
  }
}

module.exports = { SentenceKnowledge, readTally, SENTENCES_DIR, DIRECTIONS };
