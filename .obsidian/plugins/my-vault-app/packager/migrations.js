"use strict";

/*
 * Vorhandene Werkstätten auf das heutige Schema bringen.
 *
 * Ändert sich die Form der Dateien, reicht es nicht, dass neue richtig
 * entstehen - die vorhandenen liegen auf fremden Rechnern. Also läuft das
 * hier beim Start einmal durch und setzt danach die Nummer in data.json
 * hoch.
 *
 * Drei Regeln, wie drüben bei der Learning-Seite:
 *
 * - Der Umbau darf beliebig oft laufen. Was schon umgebaut ist, wird
 *   nicht noch einmal angefasst.
 * - Nichts wegwerfen, was die Person geschrieben hat. Im Zweifel bleibt
 *   das Alte liegen.
 * - Stumm durch ihre Dateien gehen wäre unheimlich. Was geschah, sagt
 *   eine Meldung.
 *
 * Der eigentliche Schnitt steht in dictionary.js und ist dort geprüft.
 */

const { TFile, TFolder } = require('obsidian');

/* Wie weit die Werkstatt umgebaut ist.
   1 - der Wortvorrat ist eine Datei statt vieler Notizen.
   2 - Hausregeln und Bauplan liegen in meta/, der Bauplan heißt
       schema.md und trägt eine Nummer. */
const SCHEMA = 2;

/* Was nach meta/ umzieht: alter Name -> neuer Name. Die Fassungen, die
   das Auffrischen daneben gelegt hat, ziehen mit. */
const INTO_META = [
  ['rules.md', 'rules.md'],
  ['word-notes.md', 'schema.md'],
  ['rules (from the repo).md', 'rules (from the repo).md'],
  ['word-notes (from the repo).md', 'schema (from the repo).md']
];

class Migrations {
  constructor(packager) {
    this.packager = packager;
    this.app = packager.app;
  }

  async run() {
    const at = Number(this.packager.settings.schema) || 0;
    if (at >= SCHEMA) return null;

    const report = { languages: 0, words: 0, moved: 0, kept: [] };
    if (at < 1) await this.wordsIntoDictionary(report);
    if (at < 2) await this.intoMeta(report);

    this.packager.settings.schema = SCHEMA;
    await this.packager.saveSettings();
    return report;
  }

  /* Aus den Wortnotizen einer Sprache wird ihr Wortvorrat: eine Datei,
     ein Eintrag je Schlüssel.

     Die Notizen bleiben liegen. Sie werden zwar nicht mehr gelesen, aber
     wegwerfen kann man sie immer noch - und wer sie behält, kann
     nachsehen, ob der Umzug stimmt. */
  async wordsIntoDictionary(report) {
    const root = this.packager.folder(this.packager.rootPath);
    if (!root) return;

    for (const child of root.children) {
      if (!(child instanceof TFolder)) continue;
      if (!/^[a-z]{2,3}$/i.test(child.name)) continue;
      if (this.packager.file(child.path + '/dictionary.json')) continue;

      const words = this.packager.folder(child.path + '/words');
      if (!words || !words.children.some((one) => one instanceof TFile)) continue;

      const dictionary = await this.packager.loadDictionary(child.name.toLowerCase());
      report.languages += 1;
      report.words += Object.keys(dictionary).length;
    }
  }

  /* Hausregeln und Bauplan in den eigenen Ordner.

     Umbenannt wird über Obsidian, nicht über die Platte - sonst gingen
     Verweise auf die Notizen ins Leere. Liegt am Ziel schon etwas, bleibt
     beides, wo es ist: Welche Fassung gilt, entscheidet dann die Person,
     nicht ein Umzug, der nachts um drei in ihren Dateien aufräumt. */
  async intoMeta(report) {
    const root = this.packager.folder(this.packager.rootPath);
    if (!root) return;

    const known = this.packager.settings.schemas || {};

    for (const child of root.children) {
      if (!(child instanceof TFolder)) continue;
      if (!/^[a-z]{2,3}$/i.test(child.name)) continue;

      const meta = child.path + '/meta';
      for (const [from, to] of INTO_META) {
        const file = this.packager.file(child.path + '/' + from);
        if (!file) continue;

        const target = meta + '/' + to;
        if (this.packager.file(target)) {
          report.kept.push(child.name + '/' + from);
          continue;
        }

        await this.packager.ensureFolder(meta);
        await this.app.fileManager.renameFile(file, target);
        report.moved += 1;

        /* Der Fingerabdruck hängt am Pfad. Zieht er nicht mit, hielte das
           Auffrischen die Notiz für angefasst und legte eine zweite
           Fassung daneben, obwohl niemand etwas geändert hat. */
        const before = child.path + '/' + from;
        if (known[before]) {
          known[target] = known[before];
          delete known[before];
        }

        /* Der Bauplan bekommt seinen neuen Namen auch im Kopf - und eine
           Nummer, falls er noch keine trägt. Am Text ändert sich nichts,
           also auch nicht am Fingerabdruck. */
        if (to.startsWith('schema')) {
          const moved = this.packager.file(target);
          if (moved) {
            await this.app.fileManager.processFrontMatter(moved, (front) => {
              front.type = 'packager-schema';
              if (front.version === undefined) front.version = 1;
            });
          }
        }
      }
    }

    this.packager.settings.schemas = known;
  }
}

module.exports = { Migrations, SCHEMA };
