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

const { TFile, TFolder } = require('obsidian');
const {
  cleanWordNote, cleanFlashcard, pendingSteps, frontmatterOf
} = require('./schema.js');

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

  /* Die Umbauschritte, in der Reihenfolge ihrer Nummern. Jeder bringt
     die Vault von der Nummer davor auf seine eigene.

     Ein Schritt muss beliebig oft laufen dürfen: Was schon umgebaut ist,
     erkennt er und lässt es liegen. Er meldet `true`, wenn er durch ist -
     sonst bleibt die Nummer stehen und er kommt beim nächsten Start
     wieder. */
  steps() {
    return [
      { to: 2, run: (report) => this.decoupleNotes(report) }
    ];
  }

  async run() {
    const from = Number(this.plugin.settings.schema) || 1;
    const todo = pendingSteps(from, this.steps().map((step) => step.to));
    if (todo.length === 0) return null;

    const report = {
      from: from, to: from, notes: 0, rescued: 0, cards: 0, links: 0, waiting: 0
    };

    for (const step of this.steps()) {
      if (!todo.includes(step.to)) continue;

      const done = await step.run(report);
      if (!done) break;

      /* Nach JEDEM Schritt vermerken. Bricht ein späterer ab, bleibt
         der frühere erledigt - sonst liefe er beim nächsten Start noch
         einmal über Dateien, die längst umgebaut sind. */
      report.to = step.to;
      this.plugin.settings.schema = step.to;
      await this.plugin.saveSettings();
    }

    return report;
  }

  /* Schritt 2: Die Word note trägt keine Abschrift aus dem Paket mehr,
     und die Flashcard zeigt über eine Eigenschaft auf sie statt über
     einen Wikilink, der auf sich selbst zeigte. */
  async decoupleNotes(report) {
    for (const language of this.library.languages()) {
      const entries = await this.wordEntries(language);
      await this.cleanNotes(language, entries, report);
      await this.cleanCards(language, report);
    }

    /* Warten noch Notizen auf ihren Text, ist der Schritt nicht durch. */
    return report.waiting === 0;
  }

  /* Den Kopf einer Notiz lesen - aus der Datei, nicht aus dem
     Metadatenspeicher. Der ist beim Start womöglich noch beim Einlesen,
     und eine Notiz, die er noch nicht kennt, sähe aus wie eine ohne
     Schlüssel. Der Umbau ginge an ihr vorbei, ein einziges Mal. */
  async headOf(file) {
    const text = await this.app.vault.read(file);
    const split = splitFile(text);
    return { text: text, split: split, front: frontmatterOf(split.head) };
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
      const head = await this.headOf(file);
      if (head.front.type !== 'word') continue;

      const entry = entries.get(String(head.front.key || '')) || null;

      /* Kein Paket kennt dieses Wort mehr - dann lässt sich nicht
         entscheiden, ob die Grammatik in der Notiz eine Abschrift war
         oder etwas Eigenes. Also nichts anfassen und später wiederkommen:
         Vielleicht ist der Text nur gerade nicht importiert. */
      if (!entry && /^##\s+Grammar\s*$/m.test(head.split.body)) {
        report.waiting += 1;
        continue;
      }

      let touched = false;
      const front = head.front;

      if (front.gloss !== undefined || front.forms !== undefined || front.source !== undefined) {
        await this.app.fileManager.processFrontMatter(file, (fm) => {
          delete fm.gloss;
          delete fm.forms;
          delete fm.source;
        });
        touched = true;
      }

      /* Nach dem Schreiben der Eigenschaften neu lesen - Obsidian hat
         die Datei eben umgeschrieben. */
      const now = touched ? await this.headOf(file) : head;
      const cleaned = cleanWordNote(now.split.body, entry ? entry.grammar : null);

      if (cleaned.body !== now.split.body) {
        await this.app.vault.modify(file, now.split.head + cleaned.body);
        touched = true;
      }
      if (cleaned.rescued) report.rescued += 1;
      if (touched) report.notes += 1;
    }
  }

  /* Die Flashcards: der nackte Wikilink raus, dafür eine Eigenschaft -
     und die Word note zeigt zurück. */
  async cleanCards(language, report) {
    const notes = await this.noteFiles(language);

    for (const file of this.cardFiles(language)) {
      const head = await this.headOf(file);
      if (head.front.type !== 'flashcard' || !head.front.key) continue;

      const key = String(head.front.key);
      const note = notes.get(key) || null;
      const label = head.front.front || key;
      let touched = false;

      const cleaned = cleanFlashcard(head.split.body);
      if (cleaned.body !== head.split.body) {
        await this.app.vault.modify(file, head.split.head + cleaned.body);
        touched = true;
      }

      if (head.front.dictionary !== undefined || (note && head.front.word === undefined)) {
        await this.app.fileManager.processFrontMatter(file, (fm) => {
          delete fm.dictionary;
          if (note) fm.word = linkTo(note, label);
        });
        touched = true;
      }

      /* Die Gegenrichtung: Die Word note ist der Knotenpunkt. */
      if (note) {
        const noteHead = await this.headOf(note);
        if (noteHead.front.flashcard === undefined) {
          await this.app.fileManager.processFrontMatter(note, (fm) => {
            fm.flashcard = linkTo(file, label);
          });
          report.links += 1;
        }
      }

      if (touched) report.cards += 1;
    }
  }

  /* Schlüssel -> Word note, aus den Dateien gelesen. */
  async noteFiles(language) {
    const map = new Map();
    for (const file of this.library.wordsOf(language)) {
      const head = await this.headOf(file);
      if (head.front.type === 'word' && head.front.key) {
        map.set(String(head.front.key), file);
      }
    }
    return map;
  }

  cardFiles(language) {
    const folder = this.app.vault.getAbstractFileByPath(this.deck.folderPath(language));
    if (!(folder instanceof TFolder)) return [];
    return folder.children.filter(
      (child) => child instanceof TFile && child.extension === 'md'
    );
  }
}

module.exports = { Migrations, splitFile };
