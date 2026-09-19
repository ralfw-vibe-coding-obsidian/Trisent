"use strict";

/*
 * Vorhandene Vaults auf das heutige Schema bringen.
 *
 * Warum es das gibt: Die Form der Notizen hat sich geändert - die Word
 * note trägt keine Abschrift aus dem Paket mehr, und die Flashcard zeigt
 * über eine Eigenschaft auf sie statt über einen Wikilink, der auf sich
 * selbst zeigte. Neue Notizen entstehen richtig. Die vorhandenen tun es
 * nicht von selbst, und sie liegen auf fremden Rechnern.
 *
 * Deshalb: Beim Start einmal durchgehen, umschreiben, merken, dass es
 * erledigt ist. Die Nummer steht in data.json unter `schema`.
 *
 * Geschnitten wird nicht hier, sondern in schema.js - das ist der Teil
 * ohne Obsidian, und der ist geprüft. Hier wird nur gelesen, geschrieben
 * und gezählt.
 */

const { TFile } = require('obsidian');
const { cleanWordNote, cleanFlashcard } = require('./schema.js');

/* Die Fassung, die diese App erwartet. Eine Vault mit kleinerer Nummer
   wird hochgezogen, eine mit größerer in Ruhe gelassen - dort war
   jemand mit einer neueren Fassung unterwegs. */
const SCHEMA = 2;

/* Frontmatter und Rumpf trennen. Die Eigenschaften ändert Obsidian
   selbst (processFrontMatter); hier geht es nur um den Text darunter. */
function splitFile(text) {
  const match = /^---\n[\s\S]*?\n---\n?/.exec(text);
  if (!match) return { head: '', body: text };
  return { head: match[0], body: text.slice(match[0].length) };
}

function linkTo(file, label) {
  return '[[' + file.path.replace(/\.md$/, '') + '|' + label + ']]';
}

class Migrations {
  constructor(plugin, learning) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.library = learning.library;
    this.deck = learning.deck;
  }

  async run() {
    const from = Number(this.plugin.settings.schema) || 1;
    if (from >= SCHEMA) return null;

    const report = { notes: 0, rescued: 0, cards: 0, links: 0, waiting: 0 };

    for (const language of this.library.languages()) {
      const entries = await this.wordEntries(language);
      await this.cleanNotes(language, entries, report);
      await this.cleanCards(language, report);
    }

    /* Warten noch Notizen auf ihren Text, bleibt die Vault auf der alten
       Nummer und der Umbau versucht es beim nächsten Start erneut. Er
       darf beliebig oft laufen: Was schon umgebaut ist, wird nicht noch
       einmal angefasst. Das ist besser, als die Notizen halb umgebaut
       zurückzulassen und die Nummer trotzdem hochzusetzen. */
    if (report.waiting === 0) {
      this.plugin.settings.schema = SCHEMA;
      await this.plugin.saveSettings();
    }
    return report;
  }

  /* Alle Word entries einer Sprache, aus allen Paketen. Einmal gelesen,
     nicht je Notiz - sonst läge die Platte bei 200 Wörtern 200 Mal an. */
  async wordEntries(language) {
    const map = new Map();
    for (const folder of this.library.packagesOf(language)) {
      const entry = await this.library.loadPackage(folder);
      if (!entry || !entry.ok) continue;
      for (const [key, word] of Object.entries(entry.data.dictionary || {})) {
        if (!map.has(key)) map.set(key, word);
      }
    }
    return map;
  }

  /* Die Word notes: Abschrift raus, Eigenschaften aufräumen. */
  async cleanNotes(language, entries, report) {
    for (const file of this.library.wordsOf(language)) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!fm || fm.type !== 'word') continue;

      const entry = entries.get(String(fm.key || '')) || null;

      /* Kein Paket kennt dieses Wort mehr - dann lässt sich nicht
         entscheiden, ob die Grammatik in der Notiz eine Abschrift war
         oder etwas Eigenes. Also nichts anfassen und später wiederkommen:
         Vielleicht ist der Text nur gerade nicht importiert. */
      if (!entry && /^##\s+Grammar\s*$/m.test(await this.app.vault.read(file))) {
        report.waiting += 1;
        continue;
      }

      let touched = false;

      if (fm.gloss !== undefined || fm.forms !== undefined || fm.source !== undefined) {
        await this.app.fileManager.processFrontMatter(file, (front) => {
          delete front.gloss;
          delete front.forms;
          delete front.source;
        });
        touched = true;
      }

      const text = await this.app.vault.read(file);
      const split = splitFile(text);
      const cleaned = cleanWordNote(split.body, entry ? entry.grammar : null);

      if (cleaned.body !== split.body) {
        await this.app.vault.modify(file, split.head + cleaned.body);
        touched = true;
      }
      if (cleaned.rescued) report.rescued += 1;
      if (touched) report.notes += 1;
    }
  }

  /* Die Flashcards: der nackte Wikilink raus, dafür eine Eigenschaft -
     und die Word note zeigt zurück. */
  async cleanCards(language, report) {
    const notes = this.library.wordFiles(language);

    for (const card of this.deck.all(language)) {
      const file = card.file;
      if (!(file instanceof TFile)) continue;

      const note = notes.get(card.key) || null;
      const label = card.front || card.key;
      let touched = false;

      const text = await this.app.vault.read(file);
      const split = splitFile(text);
      const cleaned = cleanFlashcard(split.body);

      if (cleaned.body !== split.body) {
        await this.app.vault.modify(file, split.head + cleaned.body);
        touched = true;
      }

      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
      if (fm.dictionary !== undefined || (note && fm.word === undefined)) {
        await this.app.fileManager.processFrontMatter(file, (front) => {
          delete front.dictionary;
          if (note) front.word = linkTo(note, label);
        });
        touched = true;
      }

      /* Die Gegenrichtung: Die Word note ist der Knotenpunkt. */
      if (note) {
        const noteFm = this.app.metadataCache.getFileCache(note)?.frontmatter || {};
        if (noteFm.flashcard === undefined) {
          await this.app.fileManager.processFrontMatter(note, (front) => {
            front.flashcard = linkTo(file, label);
          });
          report.links += 1;
        }
      }

      if (touched) report.cards += 1;
    }
  }
}

module.exports = { Migrations, SCHEMA, splitFile };
