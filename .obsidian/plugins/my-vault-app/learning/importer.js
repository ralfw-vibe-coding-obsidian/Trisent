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
const { packageRoot, relativeTo, readPackage } = require('./layout.js');

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

  /* Ein ZIP, wie es ein Fremder mitbringt - und wie es die Werkstatt
     künftig schickt. */
  async importArchive(bytes, label) {
    const files = await readZip(toArrayBuffer(bytes));
    const prefix = packageRoot(files.keys());
    if (prefix === null) {
      throw new Error('There is no ' + PACKAGE_FILE + ' in "' + label + '".');
    }
    return this.importContents(relativeTo(files, prefix), label);
  }

  /* Ein schon ausgepacktes Paket: Pfad (relativ zum Paketordner) -> Bytes. */
  async importContents(contents, label) {
    /* Geprüft wird nach dem Vertrag in core/package.js - für die erste
       Fassung wie bisher, für die zweite über ihre drei Dateien. */
    const pkg = readPackage(contents);
    if (pkg.problems.length > 0) {
      const error = new Error('"' + label + '" did not pass the checks.');
      error.problems = pkg.problems;
      throw error;
    }

    const head = pkg.head;
    const place = await this.placeFor(head);

    /* ZUERST das Wörterbuch, DANN die Dateien. Umgekehrt stünde ein Text
       in der Bibliothek, dessen Wörter nirgends erklärt sind, falls
       dazwischen etwas schiefgeht - das Paket selbst bringt sein
       Wörterbuch ja nicht mehr mit. So herum bleibt schlimmstenfalls ein
       Eintrag ohne Text zurück, und der schadet niemandem. */
    const words = await this.dictionary.merge(place.language, normalizeAll(pkg.dictionary));

    /* Abgelegt wird immer die zweite Fassung: Kopf und Text, dazu der
       Ton. Das Wörterbuch des Pakets bleibt draußen - es ist eingearbeitet
       und hat seinen Zweck erfüllt. */
    const out = new Map();
    out.set(PACKAGE_FILE, encode(json(head)));
    out.set(TEXT_FILE, encode(json({ paragraphs: pkg.paragraphs })));
    for (const [name, bytes] of contents) {
      if (name === PACKAGE_FILE || name === TEXT_FILE || name === DICTIONARY_FILE) continue;
      out.set(name, bytes);
    }
    await this.library.writePackageFiles(place.folder, out);

    const result = {
      title: head.title,
      language: place.language,
      folder: place.folder,
      updated: place.updated,
      addedLanguage: place.addedLanguage,
      version: head.version,
      previousVersion: place.previousVersion,
      words: words
    };

    await log(this.plugin, 'Learning', describeImport(result));
    return result;
  }

  /* Wohin das Paket gehört: in seine Sprache - die zur Not angelegt wird -
     und dorthin, wo es schon liegt, wenn es eine neue Fassung ist. */
  async placeFor(head) {
    let language = this.library.languageByCode(head.language);
    let addedLanguage = false;

    if (!language) {
      const known = KNOWN_LANGUAGES.find((entry) => entry.code === head.language);
      if (!known) {
        throw new Error('This package is in "' + head.language
          + '", which is not a language Trisent knows. Add it by hand first.');
      }
      language = await this.library.createLanguage(known.code, known.name, known.flag);
      addedLanguage = true;
    }

    const existing = await this.library.folderForPackageId(language, head.id);
    const folder = existing
      ? existing.folder
      : await this.library.newPackageFolder(language, head.title);

    return {
      language: language,
      folder: folder,
      updated: !!existing,
      addedLanguage: addedLanguage,
      previousVersion: existing ? existing.version : null
    };
  }
}

/* Ein Import, in einem Satz fürs Logbuch. */
function describeImport(result) {
  const what = '"' + result.title + '" (' + result.language.name + ')';
  let text = result.updated
    ? 'Replaced ' + what + (typeof result.previousVersion === 'number'
      ? ', version ' + result.previousVersion + ' → ' + result.version : '') + '.'
    : 'Added ' + what + (result.addedLanguage ? ' - a new language in your library' : '') + '.';

  const words = result.words || { added: 0, replaced: 0 };
  const parts = [];
  if (words.added > 0) parts.push(words.added + (words.added === 1 ? ' new word' : ' new words'));
  if (words.replaced > 0) parts.push(words.replaced + (words.replaced === 1 ? ' explained better' : ' explained better'));
  if (parts.length > 0) text += ' Your dictionary: ' + parts.join(', ') + '.';

  return text;
}

module.exports = { Importer, describeImport };
