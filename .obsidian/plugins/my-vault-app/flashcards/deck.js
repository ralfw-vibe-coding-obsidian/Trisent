"use strict";

/*
 * Die Lernkartei - eine Notiz je Karte, je Sprache ein Verzeichnis.
 *
 * Bewusst NICHT im Wörterbuch: Eine Wortnotiz soll durch eine bessere
 * Fassung ersetzt werden können, ohne dass die Lernhistorie mit
 * verschwindet. Deshalb liegen Karten daneben und verweisen über den
 * Wissensschlüssel - der ändert sich nie, ein Dateiname schon.
 *
 * Gerechnet wird in schedule.js; hier wird nur gelesen und geschrieben.
 */

const { TFile, TFolder, normalizePath } = require('obsidian');
const { normalize, today } = require('./schedule.js');

const DECK_DIR = 'flashcards';

/* In Dateinamen verbotene Zeichen. */
function safeName(name) {
  const clean = String(name).replace(/[\\/:*?"<>|#^[\]]/g, '-').trim();
  return clean || 'card';
}

function yaml(value) {
  const text = String(value);
  return /^[\wÀ-ɏΆ-ώЀ-ӿ][\wÀ-ɏΆ-ώЀ-ӿ .'’-]*$/.test(text)
    ? text
    : '"' + text.replace(/"/g, '\\"') + '"';
}

class Deck {
  constructor(app, library) {
    this.app = app;
    this.library = library;
  }

  folderPath(language) {
    return normalizePath(language.path + '/' + DECK_DIR);
  }

  /* Alle Karten einer Sprache, je Schlüssel eine. */
  all(language) {
    const folder = this.app.vault.getAbstractFileByPath(this.folderPath(language));
    if (!(folder instanceof TFolder)) return [];

    const cards = [];
    for (const child of folder.children) {
      if (!(child instanceof TFile) || child.extension !== 'md') continue;
      const fm = this.app.metadataCache.getFileCache(child)?.frontmatter;
      if (!fm || fm.type !== 'flashcard' || !fm.key) continue;

      cards.push(Object.assign(normalize(fm), {
        key: String(fm.key),
        front: fm.front ? String(fm.front) : '',
        back: fm.back ? String(fm.back) : '',
        added: fm.added ? String(fm.added) : null,
        file: child
      }));
    }
    return cards;
  }

  byKey(language) {
    const map = new Map();
    for (const card of this.all(language)) map.set(card.key, card);
    return map;
  }

  has(language, key) {
    return !!this.byKey(language).get(key);
  }

  /* Eine Karte anlegen. Gibt es sie schon, passiert nichts - das
     Hinzufügen darf beliebig oft gedrückt werden. */
  async add(language, entry) {
    const existing = this.byKey(language).get(entry.key);
    if (existing) return existing;

    const folder = this.app.vault.getAbstractFileByPath(this.folderPath(language));
    if (!(folder instanceof TFolder)) await this.library.ensureFolder(this.folderPath(language));

    const name = safeName(entry.front || entry.key);
    let path = this.folderPath(language) + '/' + name + '.md';
    for (let n = 2; this.app.vault.getAbstractFileByPath(path); n++) {
      path = this.folderPath(language) + '/' + name + ' ' + n + '.md';
    }

    const lines = [
      '---',
      'type: flashcard',
      'language: ' + language.code,
      'key: ' + yaml(entry.key),
      'front: ' + yaml(entry.front || ''),
      'back: ' + yaml(entry.back || ''),
      'level: 0',
      'seen: 0',
      'wrong: 0',
      'due: ' + today(),
      'added: ' + today(),
      '---',
      '',
      /* Nur zum Durchklicken in Obsidian - die App fragt diesen Link nie. */
      '[[' + safeName(entry.front || entry.key) + ']]',
      ''
    ];

    await this.app.vault.create(path, lines.join('\n'));
    return this.byKey(language).get(entry.key);
  }

  async remove(card) {
    if (card && card.file) await this.app.vault.trash(card.file, false);
  }

  /* Den Stand nach einer Bewertung festschreiben. */
  async save(card, state) {
    if (!card || !card.file) return;
    await this.app.fileManager.processFrontMatter(card.file, (fm) => {
      fm.level = state.level;
      fm.seen = state.seen;
      fm.wrong = state.wrong;
      fm.due = state.due;
    });
  }
}

module.exports = { Deck, DECK_DIR, safeName };
