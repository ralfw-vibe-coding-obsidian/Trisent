"use strict";

/*
 * Das Tagebuch des Übersetzens: eine Notiz je Sitzung.
 *
 *   learning/<LANG>/translations/2026-10-09 1432 Paul et Julie.md
 *
 * Im Kopf, was die Historie braucht - wann, woraus, wie viele Sätze
 * vorgenommen, wie viele geschafft, wie viele richtig. Darunter jeder
 * Versuch: der Satz, die Antwort der Person, das Original, das Urteil.
 *
 * Genau daraus kann die KI später Muster in den Fehlern lesen. Und die
 * Person kann jederzeit nachlesen, was sie wann geschrieben hat.
 *
 * Die Notiz entsteht mit dem ersten Versuch, nicht beim Start - eine
 * Sitzung, die man sofort wieder abbricht, hinterlässt nichts.
 */

const { TFile, TFolder, normalizePath } = require('obsidian');
const { now } = require('../core/calendar.js');
const { MARK, readMarks } = require('./practice.js');

const JOURNAL_DIR = 'translations';

/* Farbige Zeichen statt der schlichten aus der Textnotiz: Beim
   Überfliegen einer Sitzung soll man auf einen Blick sehen, was saß -
   Grün gegen Rot. Die Zeichenfolge je Satz (✗✓★) bleibt, wie sie ist;
   die wird gelesen, diese hier nur angesehen. */
const ICON = { wrong: '❌', correct: '✅', exact: '✅⭐' };

const VERDICT = {
  wrong: 'Not yet',
  correct: 'Correct',
  exact: 'Correct, word for word'
};

function pad(n) {
  return String(n).padStart(2, '0');
}

/* Ein Dateiname, den es auf jedem System geben darf. */
function safeName(text) {
  return String(text || '').replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim();
}

class Journal {
  constructor(app, library) {
    this.app = app;
    this.library = library;
  }

  folderPath(language) {
    return normalizePath(language.path + '/' + JOURNAL_DIR);
  }

  /* Die Notiz einer Sitzung anlegen. source: der Titel der Geschichte
     oder "The hardest". Der Name trägt die Ortszeit - so liest ihn die
     Person; im Kopf steht der Zeitpunkt in UTC. */
  async start(language, source, planned) {
    const folder = this.app.vault.getAbstractFileByPath(this.folderPath(language));
    if (!(folder instanceof TFolder)) await this.library.ensureFolder(this.folderPath(language));

    const at = new Date();
    const stamp = at.getFullYear() + '-' + pad(at.getMonth() + 1) + '-' + pad(at.getDate())
      + ' ' + pad(at.getHours()) + pad(at.getMinutes());
    const base = this.folderPath(language) + '/' + safeName(stamp + ' ' + source);

    let path = base + '.md';
    for (let n = 2; this.app.vault.getAbstractFileByPath(path); n++) path = base + ' ' + n + '.md';

    const lines = [
      '---',
      'type: translation-session',
      'language: ' + language.code,
      'source: ' + JSON.stringify(source),
      'startedAt: ' + now(at),
      'planned: ' + planned,
      'done: 0',
      'right: 0',
      'results: ""',
      '---',
      ''
    ];
    return this.app.vault.create(path, lines.join('\n'));
  }

  /* Einen Versuch anhängen und die Zahlen im Kopf nachziehen. */
  async add(file, number, entry) {
    const lines = [
      '',
      '## ' + (ICON[entry.result] || '') + ' ' + number + '. ' + entry.prompt,
      '',
      '- **You wrote:** ' + entry.answer,
      '- **Original:** ' + entry.reference,
      '- **Verdict:** ' + (ICON[entry.result] || '') + ' ' + (VERDICT[entry.result] || entry.result),
      '- **From:** ' + entry.title,
      '- **Input:** ' + (entry.spoken ? 'spoken' : 'typed')
    ];
    if (entry.note) lines.push('', entry.note);
    for (const issue of entry.issues || []) lines.push('- ' + issue);
    lines.push('');

    await this.app.vault.process(file, (text) => text.replace(/\s*$/, '\n') + lines.join('\n'));
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.done = (Number(fm.done) || 0) + 1;
      /* Die Versuche der Reihe nach, wie in der Notiz des Textes - daraus
         zeichnet die Historie ihre grünen und roten Zeichen. */
      fm.results = String(fm.results || '') + (MARK[entry.result] || '');
      if (entry.result !== 'wrong') fm.right = (Number(fm.right) || 0) + 1;
    });
  }

  /* Alle Sitzungen einer Sprache, neueste zuerst - für die Historie. */
  sessions(language) {
    const folder = this.app.vault.getAbstractFileByPath(this.folderPath(language));
    if (!(folder instanceof TFolder)) return [];

    const out = [];
    for (const child of folder.children) {
      if (!(child instanceof TFile) || child.extension !== 'md') continue;
      const fm = this.app.metadataCache.getFileCache(child)?.frontmatter;
      if (!fm || fm.type !== 'translation-session') continue;
      out.push({
        file: child,
        source: String(fm.source || ''),
        startedAt: String(fm.startedAt || ''),
        planned: Number(fm.planned) || 0,
        done: Number(fm.done) || 0,
        right: Number(fm.right) || 0,
        results: readMarks(fm.results)
      });
    }
    out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return out;
  }
}

module.exports = { Journal, JOURNAL_DIR };
