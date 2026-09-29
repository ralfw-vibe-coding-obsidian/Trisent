"use strict";

/*
 * Die Notiz eines Textes - sein Knotenpunkt für die Person.
 *
 * Gegenstück zur Word note: Dort steht, was die Person über ein Wort
 * weiß, hier, was sie über einen Text weiß. Heute sind das ihre Tags und,
 * sobald sie ihn im Translator übt, wie die Sätze gelaufen sind. Darunter
 * ist Platz für Eigenes ("## My notes").
 *
 * Jeder Text hat eine. Sie entsteht beim Import; ältere Texte bekommen
 * sie über den Umbau (Schritt 5 in migrations.js). Früher entstand sie
 * erst mit der ersten Übersetzung und hieß Satznotiz - im Ordner
 * `sentences`. Jetzt `texts`.
 *
 * Die Notiz heißt wie der Paketordner. Der Titel steht im Kopf.
 */

const { TFile, TFolder, normalizePath } = require('obsidian');
const { tagsOf, allTags, tagKey } = require('./tags.js');

const TEXTS_DIR = 'texts';
const LEGACY_TEXTS_DIR = 'sentences';

class TextNotes {
  constructor(app, library) {
    this.app = app;
    this.library = library;

    /* Frisch geschriebene Tags, bis Obsidian die Notiz neu eingelesen
       hat. Ohne das zeigte die Liste direkt nach dem Antippen noch die
       alten - der Metadatenspeicher hinkt einen Moment hinterher. */
    this.fresh = new Map();
  }

  folderPath(language) {
    return normalizePath(language.path + '/' + TEXTS_DIR);
  }

  filePath(language, packageFolder) {
    return this.folderPath(language) + '/' + packageFolder.name + '.md';
  }

  /* Die Notiz zu einem Text, falls es sie gibt. Solange der Umbau nicht
     gelaufen ist, kann sie noch als Satznotiz im alten Ordner liegen. */
  fileFor(language, packageFolder) {
    const file = this.app.vault.getAbstractFileByPath(this.filePath(language, packageFolder));
    if (file instanceof TFile) return file;

    const legacy = this.app.vault.getAbstractFileByPath(normalizePath(
      language.path + '/' + LEGACY_TEXTS_DIR + '/' + packageFolder.name + '.md'
    ));
    return legacy instanceof TFile ? legacy : null;
  }

  /* Die Notiz holen, und wenn es sie noch nicht gibt, anlegen.
     head: der Kopf des Pakets - für Titel und Kennung. */
  async ensure(language, packageFolder, head) {
    const found = this.fileFor(language, packageFolder);
    if (found) return found;

    const folder = this.app.vault.getAbstractFileByPath(this.folderPath(language));
    if (!(folder instanceof TFolder)) await this.library.ensureFolder(this.folderPath(language));

    const data = head || {};
    const lines = [
      '---',
      'type: text',
      'language: ' + language.code,
      'package: ' + (data.id || packageFolder.name),
      'title: ' + JSON.stringify(data.title || packageFolder.name),
      'tags: []',
      '---',
      '',
      '## My notes',
      ''
    ];
    return this.app.vault.create(this.filePath(language, packageFolder), lines.join('\n'));
  }

  /* Die Tags eines Textes. */
  tags(language, packageFolder) {
    const file = this.fileFor(language, packageFolder);
    return file ? this.tagsOfFile(file) : [];
  }

  /* Die Notizen aller Texte einer Sprache. */
  notesOf(language) {
    const folder = this.app.vault.getAbstractFileByPath(this.folderPath(language));
    if (!(folder instanceof TFolder)) return [];
    return folder.children.filter((child) => child instanceof TFile && child.extension === 'md');
  }

  tagsOfFile(file) {
    if (this.fresh.has(file.path)) return this.fresh.get(file.path);
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    return tagsOf(fm ? fm.tags : null);
  }

  /* Alle Tags, die in einer Sprache vorkommen - die Auswahl im Filter
     und beim Vergeben. */
  allTags(language) {
    return allTags(this.notesOf(language).map((file) => this.tagsOfFile(file)));
  }

  /* An wie vielen Texten ein Tag hängt. */
  usage(language, tag) {
    const key = tagKey(tag);
    return this.notesOf(language)
      .filter((file) => this.tagsOfFile(file).some((own) => tagKey(own) === key))
      .length;
  }

  /* Einen Tag aus allen Texten einer Sprache nehmen. Nur der Tag geht -
     die Notizen und alles andere darin bleiben. Liefert, aus wie vielen
     Texten er verschwunden ist. */
  async removeTag(language, tag) {
    const key = tagKey(tag);
    let count = 0;
    for (const file of this.notesOf(language)) {
      const own = this.tagsOfFile(file);
      if (!own.some((mine) => tagKey(mine) === key)) continue;

      const rest = own.filter((mine) => tagKey(mine) !== key);
      this.fresh.set(file.path, rest);
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm.tags = rest;
      });
      count += 1;
    }
    return count;
  }

  /* Die Tags eines Textes setzen. Legt die Notiz an, falls nötig. */
  async setTags(language, packageFolder, head, tags) {
    const file = await this.ensure(language, packageFolder, head);
    const clean = tagsOf(tags);

    this.fresh.set(file.path, clean);
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.tags = clean;
    });
    return clean;
  }

  /* Obsidian hat die Notiz neu eingelesen - ab jetzt stimmt sein
     Speicher wieder. */
  forget(path) {
    if (path) this.fresh.delete(path);
  }
}

module.exports = { TextNotes, TEXTS_DIR, LEGACY_TEXTS_DIR };
