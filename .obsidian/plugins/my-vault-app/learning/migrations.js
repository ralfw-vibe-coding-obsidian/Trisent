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

const { TFile, TFolder, normalizePath } = require('obsidian');
const {
  cleanWordNote, cleanFlashcard, pendingSteps, frontmatterOf
} = require('./schema.js');
const { normalizeAll, mergeLegacy } = require('./entries.js');
const { NOTES_DIR, LEGACY_NOTES_DIR } = require('../core/library.js');
const { PACKAGE_FILE, TEXT_FILE, splitPackage } = require('../core/package.js');

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
    this.dictionary = learning.dictionary;
  }

  /* Die Umbauschritte, in der Reihenfolge ihrer Nummern. Jeder bringt
     die Vault von der Nummer davor auf seine eigene.

     Ein Schritt muss beliebig oft laufen dürfen: Was schon umgebaut ist,
     erkennt er und lässt es liegen. Er meldet `true`, wenn er durch ist -
     sonst bleibt die Nummer stehen und er kommt beim nächsten Start
     wieder. */
  steps() {
    return [
      { to: 2, run: (report) => this.decoupleNotes(report) },
      { to: 3, run: (report) => this.centralDictionary(report) }
    ];
  }

  async run() {
    const from = Number(this.plugin.settings.schema) || 1;
    const todo = pendingSteps(from, this.steps().map((step) => step.to));
    if (todo.length === 0) return null;

    const report = {
      from: from, to: from,
      notes: 0, rescued: 0, cards: 0, links: 0, leftAlone: 0,
      entries: 0, packages: 0, moved: 0, freed: 0
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

    /* Notizen zu Wörtern, die kein Text mehr kennt, sind liegen geblieben -
       unangetastet. Der Schritt ist trotzdem durch: Würde er auf sie
       warten, käme eine Vault, aus der ein Text gelöscht wurde, nie über
       Schritt 2 hinaus und bekäme keinen späteren Umbau mehr. */
    return true;
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
         oder etwas Eigenes. Also nichts anfassen: lieber ein alter Absatz
         zu viel als ein eigener Satz zu wenig. */
      if (!entry && /^##\s+Grammar\s*$/m.test(head.split.body)) {
        report.leftAlone += 1;
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

  /* ---------------------------------------------------------------- */
  /* Schritt 3: ein Wörterbuch je Sprache                              */
  /* ---------------------------------------------------------------- */

  /* Bisher brachte jeder Text sein eigenes Wörterbuch mit, und niemand
     führte sie zusammen. Jetzt:

     1. Aus allen vorhandenen Paketen das Wörterbuch der Person bauen.
        ZUERST - solange die Pakete ihr Wissen noch enthalten.
     2. Die Pakete teilen: Kopf, Text daneben, das Wörterbuch fällt weg.
     3. Den Ordner der Word notes von "dictionary" in "notes" umbenennen.
     4. Die Flashcards von ihrer abgeschriebenen Vorder- und Rückseite
        befreien und neu mit ihrer Word note verknüpfen.

     Jeder Teil erkennt, was schon erledigt ist. Bricht der Umbau in der
     Mitte ab, läuft er beim nächsten Start von vorn und findet den Rest. */
  async centralDictionary(report) {
    for (const language of this.library.languages()) {
      await this.buildDictionary(language, report);
      await this.splitPackages(language, report);
      await this.moveNotes(language, report);
      await this.freeCards(language, report);
    }
    return true;
  }

  async buildDictionary(language, report) {
    /* Erst alles im Speicher sammeln, dann einmal schreiben. Einträge
       aus Paketen der ersten Fassung tragen keine Nummer und zählen als
       0 - jedes neuere Paket löst sie später ab. Unter gleich alten
       bleibt der erste, bekommt aber die Formen der anderen dazu: Jeder
       alte Text hat nur die Formen gelistet, die in ihm vorkommen. */
    let incoming = new Map();
    for (const folder of this.library.packagesOf(language)) {
      const data = await this.readJson(this.fileIn(folder, PACKAGE_FILE));
      if (!data || !data.dictionary) continue;
      incoming = mergeLegacy(incoming, normalizeAll(data.dictionary));
    }
    if (incoming.size === 0) return;

    const done = await this.dictionary.merge(language, incoming);
    report.entries += done.added + done.replaced;
  }

  async splitPackages(language, report) {
    for (const folder of this.library.packagesOf(language)) {
      const file = this.fileIn(folder, PACKAGE_FILE);
      const data = await this.readJson(file);

      /* Nur Pakete der ersten Fassung - bei ihnen steht der Text im Kopf.
         Ein schon geteiltes wird nicht noch einmal angefasst. Wie geteilt
         wird, sagt der Vertrag in core/package.js. */
      if (!data || !Array.isArray(data.paragraphs)) continue;
      const parts = splitPackage(data);

      /* Zuerst den Text daneben legen, dann den Kopf kürzen. Bricht es
         dazwischen ab, steht der Text noch im Kopf und die App liest ihn
         von dort - nichts ist verloren, und der nächste Lauf macht weiter. */
      await this.writeJson(folder, TEXT_FILE, parts.text);
      await this.app.vault.modify(file, JSON.stringify(parts.head, null, 2) + '\n');
      report.packages += 1;
    }
  }

  async moveNotes(language, report) {
    const old = this.library.childFolder(language.folder, LEGACY_NOTES_DIR);
    if (!old) return;

    const target = normalizePath(language.path + '/' + NOTES_DIR);
    const existing = this.library.childFolder(language.folder, NOTES_DIR);

    /* Der Normalfall: den ganzen Ordner umbenennen. */
    if (!existing) {
      report.moved += old.children.length;
      await this.app.fileManager.renameFile(old, target);
      return;
    }

    /* Beide gibt es - ein halber Umbau, oder jemand hat von Hand einen
       angelegt. Dann einzeln hinüber; liegt dort schon eine gleich
       benannte Notiz, bleibt die alte, wo sie ist. Nichts wird
       überschrieben. */
    for (const child of [...old.children]) {
      if (!(child instanceof TFile)) continue;
      const to = normalizePath(target + '/' + child.name);
      if (this.app.vault.getAbstractFileByPath(to)) continue;
      await this.app.fileManager.renameFile(child, to);
      report.moved += 1;
    }
    if (old.children.length === 0) await this.app.vault.delete(old);
  }

  async freeCards(language, report) {
    const notes = await this.noteFiles(language);

    for (const file of this.cardFiles(language)) {
      const head = await this.headOf(file);
      if (head.front.type !== 'flashcard' || !head.front.key) continue;

      const key = String(head.front.key);
      const note = notes.get(key) || null;
      const label = key.split(':')[1] || key;

      /* Der Verweis auf die Word note wird neu geschrieben, weil ihr
         Ordner eben umbenannt wurde - ob Obsidian Links beim Umbenennen
         mitzieht, ist eine Einstellung der Person, auf die wir uns nicht
         verlassen. */
      const link = note ? '[[' + note.path.replace(/\.md$/, '') + '|' + label + ']]' : null;
      const stale = head.front.front !== undefined || head.front.back !== undefined;
      const relink = link && head.front.word !== link;
      if (!stale && !relink) continue;

      await this.app.fileManager.processFrontMatter(file, (fm) => {
        delete fm.front;
        delete fm.back;
        if (link) fm.word = link;
      });
      if (stale) report.freed += 1;
    }
  }

  fileIn(folder, name) {
    return folder.children.find((child) => child instanceof TFile && child.name === name) || null;
  }

  async readJson(file) {
    if (!(file instanceof TFile)) return null;
    try {
      return JSON.parse(await this.app.vault.read(file));
    } catch (error) {
      /* Ein kaputtes Paket wird übersprungen, nicht repariert - es
         bleibt, wie es ist, und die App zeigt es als kaputt an. */
      console.error('Trisent: could not read ' + file.path, error);
      return null;
    }
  }

  async writeJson(folder, name, value) {
    const text = JSON.stringify(value, null, 2) + '\n';
    const existing = this.fileIn(folder, name);
    if (existing) await this.app.vault.modify(existing, text);
    else await this.app.vault.create(normalizePath(folder.path + '/' + name), text);
  }

  cardFiles(language) {
    const folder = this.app.vault.getAbstractFileByPath(this.deck.folderPath(language));
    if (!(folder instanceof TFolder)) return [];
    return folder.children.filter(
      (child) => child instanceof TFile && child.extension === 'md'
    );
  }
}

/* Was der Umbau getan hat, in ein paar Sätzen für die Person. Eine
   Migration, die stumm durch ihre Notizen geht, wäre unheimlich - und
   eine, die in Fachsprache berichtet, auch. */
function describe(report) {
  if (!report) return null;
  const said = [];
  const n = (count, one, many) => count + ' ' + (count === 1 ? one : many);

  const tidied = [];
  if (report.notes > 0) tidied.push(n(report.notes, 'word note', 'word notes'));
  if (report.cards > 0) tidied.push(n(report.cards, 'flashcard', 'flashcards'));
  if (tidied.length > 0) said.push('Trisent tidied up ' + tidied.join(' and ') + '.');

  if (report.rescued > 0) {
    said.push(n(report.rescued, 'grammar note you had changed was', 'grammar notes you had changed were')
      + ' kept under "My notes".');
  }

  if (report.entries > 0 || report.packages > 0) {
    const parts = [];
    if (report.entries > 0) parts.push('your dictionary now holds ' + n(report.entries, 'word', 'words'));
    if (report.packages > 0) parts.push(n(report.packages, 'text was', 'texts were') + ' rearranged');
    said.push(parts.join('; ').replace(/^./, (c) => c.toUpperCase()) + '.');
  }

  if (report.moved > 0) said.push('Word notes now live in the folder "notes".');
  if (report.freed > 0) {
    said.push(n(report.freed, 'flashcard now takes its', 'flashcards now take their')
      + ' meaning from your dictionary.');
  }

  if (report.leftAlone > 0) {
    said.push(n(report.leftAlone, 'word note kept its', 'word notes kept their')
      + ' old grammar text - no text explains those words any more.');
  }

  return said.length > 0 ? said.join(' ') : null;
}

module.exports = { Migrations, splitFile, describe };
