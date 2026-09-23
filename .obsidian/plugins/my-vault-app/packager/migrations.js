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
   1 - der Wortvorrat ist eine Datei statt vieler Notizen. */
const SCHEMA = 1;

class Migrations {
  constructor(packager) {
    this.packager = packager;
    this.app = packager.app;
  }

  async run() {
    const at = Number(this.packager.settings.schema) || 0;
    if (at >= SCHEMA) return null;

    const report = { languages: 0, words: 0 };
    await this.wordsIntoDictionary(report);

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
}

module.exports = { Migrations, SCHEMA };
