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

    const record = {
      key: entry.key,
      front: entry.front || '',
      back: entry.back || '',
      level: 0,
      seen: 0,
      wrong: 0,
      due: today(),
      added: today()
    };

    const lines = [
      '---',
      'type: flashcard',
      'language: ' + language.code,
      'key: ' + yaml(record.key)
    ];

    /* Der Weg zur Wortnotiz, als Eigenschaft: Dort steht er strukturiert
       neben den anderen Angaben, statt im Fließtext.

       Mit ganzem Pfad. Ein kurzes [[après]] ginge hier daneben - die
       Karte heißt genauso, nur in einem anderen Ordner, und Obsidian
       löst den kurzen Namen auf die nächstliegende Notiz auf, also auf
       die Karte selbst. */
    if (entry.note) {
      lines.push('dictionary: ' + yaml(
        '[[' + entry.note.path.replace(/\.md$/, '')
        + '|' + (record.front || record.key) + ']]'
      ));
    }

    lines.push('front: ' + yaml(record.front));
    lines.push('back: ' + yaml(record.back));
    lines.push('level: ' + record.level);
    lines.push('seen: ' + record.seen);
    lines.push('wrong: ' + record.wrong);
    lines.push('due: ' + record.due);
    lines.push('added: ' + record.added);
    lines.push('---');

    /* Der Platz der Person. Was sie sich beim Üben zu dieser Karte
       merkt, gehört zur Karte - nicht in die Wortnotiz, die dem Wort
       gehört und die ein neues Paket ersetzen darf. */
    lines.push('## My notes');
    lines.push('');
    lines.push('');

    const file = await this.app.vault.create(path, lines.join('\n'));

    /* Die eben angelegte Karte NICHT über den Metadatenspeicher
       zurücklesen. Der kennt die Notiz erst einen Augenblick später -
       bis dahin käme hier nichts zurück, und die Oberfläche zeigte
       weiter den Knopf zum Hinzufügen, als wäre nichts geschehen.
       Wir wissen ja, was drinsteht: Wir haben es gerade geschrieben. */
    return Object.assign(normalize(record), {
      key: record.key,
      front: record.front,
      back: record.back,
      added: record.added,
      file: file
    });
  }

  async remove(card) {
    if (card && card.file) await this.app.vault.trash(card.file, false);
  }

  /* Den Stand nach einer Bewertung festschreiben - und ihn der Karte in
     der Hand gleich mitgeben. Sonst zeigte eine Liste, die kurz darauf
     gezeichnet wird, noch den alten Stand: Der Metadatenspeicher hinkt
     einem frischen Schreibvorgang hinterher. */
  async save(card, state) {
    if (!card || !card.file) return;
    await this.app.fileManager.processFrontMatter(card.file, (fm) => {
      fm.level = state.level;
      fm.seen = state.seen;
      fm.wrong = state.wrong;
      fm.due = state.due;
    });
    card.level = state.level;
    card.seen = state.seen;
    card.wrong = state.wrong;
    card.due = state.due;
  }
}

module.exports = { Deck, DECK_DIR, safeName };
