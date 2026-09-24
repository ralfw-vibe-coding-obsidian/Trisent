"use strict";

/*
 * Das Wörterbuch der Person - eine Datei je Sprache, alles, was je
 * importiert wurde.
 *
 * Bisher brachte jeder Text seine eigenen Erklärungen mit, und niemand
 * führte sie zusammen. Dasselbe Wort konnte im einen Text anders erklärt
 * sein als im anderen, und die Word card hatte zwei Wege zur Antwort -
 * aus dem Text heraus und aus der Notiz heraus, mit verschiedenen
 * Ergebnissen. Ab hier gibt es genau eine Quelle.
 *
 * Hier wird gelesen und geschrieben. Was beim Abgleich gewinnt, steht in
 * entries.js und ist dort geprüft.
 *
 * Was NICHT hier steht: irgendetwas von der Person. Diese Datei ist
 * jederzeit aus den Paketen neu aufbaubar - Lernstand und eigene Notizen
 * liegen in den Word notes.
 */

const { TFile, normalizePath } = require('obsidian');
const {
  normalizeAll, normalizeEntry, mergeEntries, planMerge, applyMerge, toObject
} = require('./entries.js');
const { lookupWord } = require('./occurrences.js');

const DICTIONARY_FILE = 'dictionary.json';

class Dictionary {
  constructor(app, library) {
    this.app = app;
    this.library = library;
    /* Sprachcode -> Map(Schlüssel -> Eintrag). Ein Wörterbuch wird bei
       jedem Wort gebraucht, das irgendwo auftaucht; es bei jedem Blick
       von der Platte zu lesen, wäre Unfug. */
    this.cache = new Map();
  }

  pathFor(language) {
    return normalizePath(language.path + '/' + DICTIONARY_FILE);
  }

  /* Das ganze Wörterbuch einer Sprache. */
  async entries(language) {
    const cached = this.cache.get(language.code);
    if (cached) return cached;

    const entries = await this.read(language);
    this.cache.set(language.code, entries);
    return entries;
  }

  async read(language) {
    const file = this.app.vault.getAbstractFileByPath(this.pathFor(language));
    if (!(file instanceof TFile)) return new Map();

    try {
      return normalizeAll(JSON.parse(await this.app.vault.read(file)));
    } catch (error) {
      /* Eine kaputte Datei darf die App nicht anhalten - dann ist eben
         nichts bekannt, und der nächste Import baut es wieder auf. */
      console.error('Trisent: could not read the dictionary of ' + language.code, error);
      return new Map();
    }
  }

  /* Ein Wort nachschlagen.

     Zuerst hier, dann in den Paketen. Der zweite Weg ist der Rückfall
     für die Übergangszeit: Solange eine Vault noch nicht umgebaut ist,
     steht das Wissen nur in den Paketen. Nach dem Umbau greift er nicht
     mehr - und schadet auch dann nicht, wenn die Person ein Paket von
     Hand hineinlegt, bevor die App es eingearbeitet hat. */
  async lookup(language, key) {
    const found = (await this.entries(language)).get(key);
    if (found) return found;

    const fromPackage = await lookupWord(this.library, language, key);
    return fromPackage ? normalizeEntry(fromPackage, key) : null;
  }

  /* Das Wörterbuch eines Textes, überlagert vom zentralen: Was hier
     steht, gilt; was fehlt, kommt aus dem Paket.

     Damit sagen Text und Word card dasselbe, auch während des Umbaus.
     Genau das war der Fehler, um den es bei dem ganzen Vorhaben geht -
     zwei Wege zur Erklärung, zwei Antworten. */
  async overlay(language, packageDictionary) {
    const central = await this.entries(language);
    const merged = Object.assign({}, packageDictionary || {});

    for (const [key, entry] of central) merged[key] = entry;
    return merged;
  }

  /* Ein Wort nachschlagen, ohne zu warten - liefert nur, was schon
     gelesen ist. Für Listen, die im Zeichnen stecken und nicht warten
     können; vorher einmal entries() abwarten. */
  peek(language, key) {
    const entries = this.cache.get(language.code);
    return (entries && entries.get(key)) || null;
  }

  /* Was ein Paket mitbringt, einarbeiten. Liefert, was dabei geschah. */
  async merge(language, incoming) {
    const current = await this.entries(language);
    const result = mergeEntries(current, incoming);

    /* Nur schreiben, wenn sich wirklich etwas geändert hat - sonst
       schriebe jeder Import dieselbe Datei neu, und die Vault hätte eine
       Änderung, die keine ist. */
    if (result.report.added > 0 || result.report.replaced > 0) {
      await this.write(language, result.entries);
    }
    return result.report;
  }

  /* Was ein Paket am Wörterbuch ändern würde - ohne es zu tun. */
  async plan(language, incoming) {
    return planMerge(await this.entries(language), incoming);
  }

  /* Ein Paket einarbeiten, mit der Antwort der Person auf die Frage, ob
     neuere Erklärungen die vorhandenen ersetzen sollen. Neue Wörter
     kommen in jedem Fall dazu. */
  async apply(language, incoming, takeUpgrades) {
    const current = await this.entries(language);
    const result = applyMerge(current, incoming, takeUpgrades);
    if (result.report.added > 0 || result.report.replaced > 0) {
      await this.write(language, result.entries);
    }
    return result.report;
  }

  async write(language, entries) {
    this.cache.set(language.code, entries);

    const text = JSON.stringify(toObject(entries), null, 2) + '\n';
    const path = this.pathFor(language);
    const file = this.app.vault.getAbstractFileByPath(path);

    if (file instanceof TFile) await this.app.vault.modify(file, text);
    else await this.app.vault.create(path, text);
  }

  /* Von außen geändert - beim nächsten Blick neu lesen. Die Person darf
     ihre Dateien schließlich anfassen. */
  forget(path) {
    if (!path) {
      this.cache.clear();
      return;
    }
    if (!String(path).endsWith(DICTIONARY_FILE)) return;

    for (const language of this.library.languages()) {
      if (this.pathFor(language) === normalizePath(path)) this.cache.delete(language.code);
    }
  }
}

module.exports = { Dictionary, DICTIONARY_FILE };
