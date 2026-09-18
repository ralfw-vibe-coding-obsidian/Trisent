"use strict";

/*
 * Was die Person über Sätze weiß.
 *
 * Gegenstück zum Wörterbuch: Dort steht, welche Wörter sitzen, hier,
 * welche Sätze sie in welcher Richtung schon übersetzen konnte - und wie
 * oft. Eine Notiz je Text, damit man sie noch von Hand lesen kann.
 *
 * Die Antworten selbst werden NICHT aufgehoben. Nur, dass es geklappt hat.
 */

const { TFile, TFolder, normalizePath } = require('obsidian');

const SENTENCES_DIR = 'sentences';

/* Die beiden Übungsrichtungen. "intoForeign" ist die schwerere: Wer in die
   Fremdsprache schreibt, muss sie wirklich können. */
const DIRECTIONS = [
  { id: 'intoForeign', short: '→ foreign' },
  { id: 'intoNative', short: '→ native' }
];

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

  /* Wie oft ein Satz in einer Richtung schon saß. */
  counts(language, packageFolder) {
    const file = this.fileFor(language, packageFolder);
    if (!file) return { intoForeign: {}, intoNative: {} };

    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
    return {
      intoForeign: fm.intoForeign && typeof fm.intoForeign === 'object' ? fm.intoForeign : {},
      intoNative: fm.intoNative && typeof fm.intoNative === 'object' ? fm.intoNative : {}
    };
  }

  /* Wie viele Sätze eines Textes in einer Richtung schon mindestens einmal
     saßen - die Zahl, die in der Textliste steht. */
  solved(language, packageFolder, direction) {
    const counts = this.counts(language, packageFolder)[direction] || {};
    let n = 0;
    for (const key of Object.keys(counts)) {
      if (Number(counts[key]) > 0) n += 1;
    }
    return n;
  }

  /* Einen Erfolg vermerken. Der Zähler wächst, er schrumpft nie - ein Satz,
     den man einmal konnte, bleibt gezählt. */
  async record(language, packageFolder, data, direction, sentenceId) {
    const file = this.fileFor(language, packageFolder)
      || (await this.create(language, packageFolder, data));

    await this.app.fileManager.processFrontMatter(file, (fm) => {
      if (!fm[direction] || typeof fm[direction] !== 'object') fm[direction] = {};
      const before = Number(fm[direction][sentenceId]) || 0;
      fm[direction][sentenceId] = before + 1;
      fm.updatedAt = new Date().toISOString().slice(0, 10);
    });

    return file;
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
      'Welche Sätze dieses Textes du übersetzen konntest, und wie oft.',
      'Die Übersetzungen selbst werden nicht aufgehoben.',
      ''
    ];
    return this.app.vault.create(this.filePath(language, packageFolder), lines.join('\n'));
  }
}

module.exports = { SentenceKnowledge, SENTENCES_DIR, DIRECTIONS };
