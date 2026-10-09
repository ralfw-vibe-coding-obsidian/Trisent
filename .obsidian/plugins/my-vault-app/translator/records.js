"use strict";

/*
 * Was die Person beim Übersetzen erlebt hat - aufgeschrieben in der
 * Notiz des Textes (learning/<LANG>/texts/, siehe learning/texts.js).
 *
 *   translations:
 *     s003: ✗✓✓
 *     s007: ★
 *   excluded:
 *     - s012
 *
 * Je Satz die Folge der Versuche (Zeichen in practice.js), dazu die
 * Sätze, die sie ausgeschlossen hat. Beides kann sie dort lesen und von
 * Hand ändern - ein Satz kommt zurück, wenn sie ihn aus `excluded`
 * nimmt.
 *
 * Die Felder des alten Translators (intoForeign, intoNative) bleiben in
 * der Notiz stehen, werden aber nicht mehr gelesen.
 */

const { addMark } = require('./practice.js');

class Records {
  constructor(app, texts) {
    this.app = app;
    this.texts = texts;

    /* Frisch Geschriebenes, bis Obsidian die Notiz neu eingelesen hat -
       sonst sähe die nächste Sitzung, gleich danach gestartet, noch den
       alten Stand. */
    this.fresh = new Map();
  }

  /* Obsidian hat die Notiz neu eingelesen - ab jetzt stimmt sein
     Speicher wieder. */
  forget(path) {
    if (path) this.fresh.delete(path);
  }

  /* { marks: { id: '✗✓' }, excluded: Set } für einen Text. */
  of(language, packageFolder) {
    const file = this.texts.fileFor(language, packageFolder);
    if (!file) return { marks: {}, excluded: new Set() };
    if (this.fresh.has(file.path)) return this.fresh.get(file.path);

    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
    const marks = {};
    if (fm.translations && typeof fm.translations === 'object') {
      for (const id of Object.keys(fm.translations)) marks[id] = String(fm.translations[id] || '');
    }
    const excluded = new Set(Array.isArray(fm.excluded) ? fm.excluded.map(String) : []);
    return { marks: marks, excluded: excluded };
  }

  /* Einen Versuch vermerken. head: der Kopf des Pakets, falls die Notiz
     erst entstehen muss. */
  async record(language, packageFolder, head, sentenceId, result) {
    const file = await this.texts.ensure(language, packageFolder, head);
    const before = this.of(language, packageFolder);
    const marks = Object.assign({}, before.marks);
    marks[sentenceId] = addMark(marks[sentenceId], result);
    this.fresh.set(file.path, { marks: marks, excluded: before.excluded });

    await this.app.fileManager.processFrontMatter(file, (fm) => {
      if (!fm.translations || typeof fm.translations !== 'object') fm.translations = {};
      fm.translations[sentenceId] = addMark(fm.translations[sentenceId], result);
    });
  }

  /* Einen Satz ausschließen - er kommt nicht mehr, zählt aber nicht als
     Versuch. */
  async exclude(language, packageFolder, head, sentenceId) {
    const file = await this.texts.ensure(language, packageFolder, head);
    const before = this.of(language, packageFolder);
    const excluded = new Set(before.excluded);
    excluded.add(String(sentenceId));
    this.fresh.set(file.path, { marks: before.marks, excluded: excluded });

    await this.app.fileManager.processFrontMatter(file, (fm) => {
      const list = Array.isArray(fm.excluded) ? fm.excluded.map(String) : [];
      if (!list.includes(String(sentenceId))) list.push(String(sentenceId));
      fm.excluded = list;
    });
  }
}

module.exports = { Records };
