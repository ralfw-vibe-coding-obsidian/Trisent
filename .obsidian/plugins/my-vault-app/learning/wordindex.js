"use strict";

/*
 * Der Index der Person - abgelegt in ihren Word notes.
 *
 * Die Regeln (was aufnehmen, archivieren, löschen heißt) stehen in
 * marks.js. Hier wird gelesen und geschrieben. Reader und Translator
 * nehmen Wörter auf, die Index-Ansicht (index/) zeigt sie.
 *
 * Wie überall bei frisch Geschriebenem: Obsidians Metadatenspeicher
 * hinkt einen Moment hinterher. Bis er nachgezogen hat, gilt, was hier
 * zuletzt geschrieben wurde - sonst zeigte der Knopf nach dem Antippen
 * noch den alten Stand.
 */

const { markOf, addMark, archiveMark, restoreMark, clearMark } = require('./marks.js');
const { now } = require('../core/calendar.js');

class WordIndex {
  constructor(app, library) {
    this.app = app;
    this.library = library;
    /* Pfad der Word note -> der Index-Teil ihres Kopfes, frisch
       geschrieben. */
    this.fresh = new Map();
  }

  forget(path) {
    if (path) this.fresh.delete(path);
  }

  headOf(file) {
    if (this.fresh.has(file.path)) return this.fresh.get(file.path);
    return this.app.metadataCache.getFileCache(file)?.frontmatter || null;
  }

  /* Der Index-Stand eines Wortes, oder null. */
  markFor(language, key) {
    const file = this.library.wordFileFor(language, key);
    return file ? markOf(this.headOf(file)) : null;
  }

  /* Alle Wörter einer Sprache, die im Index stehen - archivierte
     eingeschlossen. [{ key, lemma, file, mark }] */
  entries(language) {
    const out = [];
    for (const file of this.library.wordsOf(language)) {
      const fm = this.headOf(file);
      const mark = markOf(fm);
      if (!mark || !fm.key) continue;
      out.push({
        key: String(fm.key),
        lemma: String(fm.lemma || String(fm.key).split(':')[1] || fm.key),
        file: file,
        mark: mark
      });
    }
    return out;
  }

  /* Die Schlüssel, die gerade sichtbar im Index stehen - für das kleine
     Zeichen im Text. */
  activeKeys(language) {
    const keys = new Set();
    for (const entry of this.entries(language)) {
      if (!entry.mark.archived) keys.add(entry.key);
    }
    return keys;
  }

  /* Ein Wort aufnehmen - auch erneut. Gibt es noch keine Word note,
     entsteht sie jetzt, mit dem Lernstand, den das Wort ohnehin hat.
     origin: 'reader' oder 'translator'. */
  async add(language, key, origin, status, entry) {
    let file = this.library.wordFileFor(language, key);
    if (!file) {
      file = await this.library.setWordStatus(language, key, status || 'unknown', entry);
    }
    const at = now();
    return this.change(file, (fm) => addMark(fm, origin, at));
  }

  archive(language, key) {
    return this.changeKey(language, key, archiveMark);
  }

  restore(language, key) {
    return this.changeKey(language, key, restoreMark);
  }

  /* Ohne Spur heraus - die Word note selbst bleibt. */
  remove(language, key) {
    return this.changeKey(language, key, clearMark);
  }

  async changeKey(language, key, fn) {
    const file = this.library.wordFileFor(language, key);
    if (!file) return null;
    return this.change(file, fn);
  }

  /* Schreiben und den neuen Stand gleich merken. Gemerkt wird eine
     Kopie des Kopfes mit den neuen Index-Feldern. */
  async change(file, fn) {
    const before = Object.assign({}, this.headOf(file) || {});
    const after = fn(Object.assign({}, before));
    this.fresh.set(file.path, after);
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fn(fm);
    });
    return markOf(after);
  }
}

module.exports = { WordIndex };
