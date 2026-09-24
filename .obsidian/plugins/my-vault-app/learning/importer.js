"use strict";

/*
 * Der Weg eines Pakets in die Bibliothek der Person.
 *
 * Es gibt genau einen, und er beginnt in der Inbox (inbox.js): Ein ZIP -
 * aus der Werkstatt nebenan oder von einem Fremden - wird ausgepackt,
 * geprüft, sein Wörterbuch in das der Person eingearbeitet, und dann
 * abgelegt. Gleiche Prüfung, gleiche Ablage, gleiches Verhalten für
 * beide. Eine Abkürzung für die eigene Seite würde mit der Zeit vom
 * fremden Weg abweichen, und genau das fiele niemandem auf.
 *
 * Welche Fassung ein Paket hat, weiß hier niemand mehr: Das klärt
 * layout.js, und dahinter sehen beide gleich aus.
 */

const { readZip } = require('../core/zip.js');
const { PACKAGE_FILE, TEXT_FILE, DICTIONARY_FILE } = require('../core/package.js');
const { KNOWN_LANGUAGES } = require('../core/library.js');
const { log } = require('../core/log.js');
const { normalizeAll } = require('./entries.js');
const { packageRoot, relativeTo, readPackage, compareVersion } = require('./layout.js');

function toArrayBuffer(bytes) {
  if (bytes instanceof ArrayBuffer) return bytes;
  if (bytes && bytes.buffer instanceof ArrayBuffer) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
  throw new Error('An archive has to arrive as bytes.');
}

function encode(text) {
  return new TextEncoder().encode(text);
}

function json(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

class Importer {
  constructor(learning) {
    this.plugin = learning.plugin;
    this.library = learning.library;
    this.dictionary = learning.dictionary;
  }

  /* Ein ZIP aus der Inbox.

     ask: eine Frage an die Person, ob neuere Erklärungen die vorhandenen
     ersetzen sollen. Bekommt { title, language, upgrades } und liefert
     ein Versprechen auf ja oder nein. Fehlt sie, gilt nein - im Zweifel
     bleibt, was die Person schon hat. */
  async importArchive(bytes, label, ask) {
    const files = await readZip(toArrayBuffer(bytes));
    const prefix = packageRoot(files.keys());
    if (prefix === null) {
      throw new Error('There is no ' + PACKAGE_FILE + ' in "' + label + '".');
    }
    return this.importContents(relativeTo(files, prefix), label, ask);
  }

  /* Ein schon ausgepacktes Paket: Pfad (relativ zum Paketordner) -> Bytes.

     Erst schauen, dann fragen, dann schreiben:
     1. Ist der Text schon bekannt, und in welcher Fassung?
     2. Was würde sich am Wörterbuch ändern? Folgen Erklärungen einem
        neueren Bauplan, wird gefragt.
     3. Erst jetzt wird geschrieben - zuerst das Wörterbuch, dann der Text.

     Liefert, was geschah - `status` sagt, was mit dem Text war:
     'new', 'newer', 'same' oder 'older'. */
  async importContents(contents, label, ask) {
    /* Geprüft wird nach dem Vertrag in core/package.js - für die erste
       Fassung wie bisher, für die zweite über ihre drei Dateien. */
    const pkg = readPackage(contents);
    if (pkg.problems.length > 0) {
      const error = new Error('"' + label + '" did not pass the checks.');
      error.problems = pkg.problems;
      throw error;
    }

    const head = pkg.head;

    /* 1. Der Text. Nachsehen, ohne etwas anzulegen - bei einem
       Rückschritt soll hinterher nicht einmal ein leerer Ordner da sein. */
    let language = this.library.languageByCode(head.language);
    if (!language && !KNOWN_LANGUAGES.some((entry) => entry.code === head.language)) {
      throw new Error('This package is in "' + head.language
        + '", which is not a language Trisent knows. Add it by hand first.');
    }
    const existing = language ? await this.library.folderForPackageId(language, head.id) : null;
    const status = compareVersion(existing ? existing.version : null, head.version);

    const result = {
      status: status,
      title: head.title,
      language: language,
      languageName: language ? language.name : this.languageName(head.language),
      version: head.version,
      previousVersion: existing ? existing.version : null,
      addedLanguage: false,
      words: { added: 0, replaced: 0, declined: 0 }
    };

    /* Ein Rückschritt wird nicht übernommen - weder Text noch Wörter. */
    if (status === 'older') {
      await log(this.plugin, 'Learning', describeImport(result));
      return result;
    }

    /* 2. Das Wörterbuch. Erst planen, und nur wenn Erklärungen einem
       neueren Bauplan folgen, fragen. */
    const incoming = normalizeAll(pkg.dictionary);
    const plan = language
      ? await this.dictionary.plan(language, incoming)
      : { added: [...incoming.keys()], upgrades: [], kept: 0 };

    let takeUpgrades = false;
    if (plan.upgrades.length > 0 && typeof ask === 'function') {
      takeUpgrades = await ask({
        title: head.title,
        language: result.languageName,
        upgrades: plan.upgrades
      }) === true;
    }

    /* 3. Schreiben. Eine fehlende Sprache entsteht erst jetzt. */
    if (!language) {
      const known = KNOWN_LANGUAGES.find((entry) => entry.code === head.language);
      language = await this.library.createLanguage(known.code, known.name, known.flag);
      result.language = language;
      result.addedLanguage = true;
    }

    /* ZUERST das Wörterbuch, DANN die Dateien. Umgekehrt stünde ein Text
       in der Bibliothek, dessen Wörter nirgends erklärt sind, falls
       dazwischen etwas schiefgeht - das Paket selbst bringt sein
       Wörterbuch ja nicht mehr mit. So herum bleibt schlimmstenfalls ein
       Eintrag ohne Text zurück, und der schadet niemandem. */
    result.words = await this.dictionary.apply(language, incoming, takeUpgrades);

    /* Dieselbe Fassung liegt schon da - nichts abzulegen. */
    if (status === 'new' || status === 'newer') {
      const folder = existing
        ? existing.folder
        : await this.library.newPackageFolder(language, head.title);

      /* Abgelegt wird immer die zweite Fassung: Kopf und Text, dazu der
         Ton. Das Wörterbuch des Pakets bleibt draußen - es ist
         eingearbeitet und hat seinen Zweck erfüllt. */
      const out = new Map();
      out.set(PACKAGE_FILE, encode(json(head)));
      out.set(TEXT_FILE, encode(json({ paragraphs: pkg.paragraphs })));
      for (const [name, bytes] of contents) {
        if (name === PACKAGE_FILE || name === TEXT_FILE || name === DICTIONARY_FILE) continue;
        out.set(name, bytes);
      }
      await this.library.writePackageFiles(folder, out);
      result.folder = folder;
    }

    await log(this.plugin, 'Learning', describeImport(result));
    return result;
  }

  languageName(code) {
    const known = KNOWN_LANGUAGES.find((entry) => entry.code === code);
    return known ? known.name : code;
  }
}

/* Ein Import, in einem Satz - fürs Logbuch und für den Bericht. */
function describeImport(result) {
  const what = '"' + result.title + '" (' + result.languageName + ')';
  const from = result.previousVersion;
  const to = result.version;

  let text;
  if (result.status === 'older') {
    text = what + ': you already have version ' + from
      + ' - version ' + to + ' was left in your inbox.';
  } else if (result.status === 'same') {
    text = what + ' is already in your library, version ' + to + '.';
  } else if (result.status === 'newer') {
    text = 'Updated ' + what + ' to version ' + to + ' (you had ' + from + ').';
  } else {
    text = 'Added ' + what + (result.addedLanguage ? ' - a new language in your library' : '') + '.';
  }

  const words = result.words || {};
  const parts = [];
  if (words.added > 0) parts.push(words.added + (words.added === 1 ? ' new word' : ' new words'));
  if (words.replaced > 0) {
    parts.push(words.replaced + (words.replaced === 1 ? ' explanation' : ' explanations') + ' updated');
  }
  if (words.declined > 0) {
    parts.push('kept your explanations for ' + words.declined
      + (words.declined === 1 ? ' word' : ' words'));
  }
  if (parts.length > 0) text += ' Dictionary: ' + parts.join(', ') + '.';

  return text;
}

module.exports = { Importer, describeImport };
