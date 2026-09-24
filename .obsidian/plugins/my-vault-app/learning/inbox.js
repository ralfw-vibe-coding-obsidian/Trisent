"use strict";

/*
 * Die Inbox - der einzige Ort, an dem Pakete in die Bibliothek kommen.
 *
 * Werkstatt und Bibliothek teilen sich keine Funktion mehr, nur noch
 * diesen Ordner und eine Dateiform: ein Paket als ZIP. Der Packager legt
 * hinein, was er geschnürt hat; ein Fremder schickt eine ZIP, und die
 * Person legt sie ebenfalls hier ab. Importiert wird, wenn die Person es
 * möchte - nicht von selbst.
 *
 * Was danach mit einer Datei geschieht:
 * - angekommen oder schon bekannt: Sie wandert in den Papierkorb von
 *   Obsidian. Die Inbox ist ein Posteingang; was erledigt ist, liegt dort
 *   nicht mehr herum. Aus dem Papierkorb lässt sie sich zurückholen.
 * - ältere Fassung als in der Bibliothek: Sie bleibt liegen. Ein
 *   Rückschritt geschieht nicht beim Aufräumen - wer ihn will, soll es
 *   sehen und selbst entscheiden.
 * - abgewiesen: Sie bleibt liegen, und die Person erfährt, warum. Weg
 *   wäre sie nur verschwunden, ohne dass jemand den Fehler sieht.
 */

const { TFile, TFolder, normalizePath } = require('obsidian');

const INBOX_DIR = 'inbox';

class Inbox {
  constructor(learning) {
    this.plugin = learning.plugin;
    this.app = learning.plugin.app;
    this.importer = learning.importer;
  }

  /* <Bibliotheksordner>/inbox - neben learning/ und packager/, weil er
     keinem von beiden gehört. */
  path() {
    const base = String(this.plugin.settings.libraryFolder || '').trim().replace(/\/+$/, '');
    return normalizePath((base ? base + '/' : '') + INBOX_DIR);
  }

  /* Die Pakete, die warten - jede ZIP direkt im Ordner. */
  waiting() {
    const folder = this.app.vault.getAbstractFileByPath(this.path());
    if (!(folder instanceof TFolder)) return [];
    return folder.children
      .filter((child) => child instanceof TFile && child.extension.toLowerCase() === 'zip')
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /* Alles importieren, was wartet. Liefert, was ankam und was nicht.

     ask: die Frage an die Person, ob neuere Erklärungen übernommen werden
     sollen - siehe Importer.importArchive(). Sie wird je Paket höchstens
     einmal gestellt, und nur, wenn es etwas zu entscheiden gibt. */
  async importAll(ask) {
    const report = { done: [], failed: [] };

    for (const file of this.waiting()) {
      let result;
      try {
        result = await this.importer.importArchive(
          await this.app.vault.readBinary(file), file.name, ask
        );
      } catch (error) {
        report.failed.push({
          name: file.name,
          message: String(error.message || error),
          problems: error.problems || []
        });
        continue;
      }

      report.done.push(result);
      if (result.status === 'older') continue;

      try {
        await this.app.vault.trash(file, false);
      } catch (error) {
        /* Das Paket ist angekommen; dass die Datei liegen bleibt, ist
           ärgerlich, aber kein Schaden - beim nächsten Import käme sie als
           dieselbe Fassung noch einmal, und das ändert nichts. */
        console.error('Trisent: could not clear ' + file.path + ' from the inbox', error);
      }
    }

    return report;
  }
}

module.exports = { Inbox, INBOX_DIR };
