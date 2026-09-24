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
const store = require('./dictionary.js');
const manifests = require('./manifest.js');

/* Die Schritte, nummeriert. Jeder bringt die Werkstatt von der Nummer
   davor auf seine eigene, und die Nummer wird nach JEDEM Schritt
   gespeichert: Bricht ein späterer ab, bleibt der frühere erledigt und
   läuft nicht noch einmal. */
const STEPS = [
  /* 1 - der Wortvorrat ist eine Datei statt vieler Notizen. */
  { to: 1, run: (m, report) => m.wordsIntoDictionary(report) },
  /* 2 - Hausregeln und Bauplan liegen in meta/, der Bauplan heißt
         schema.md und trägt eine Nummer. */
  { to: 2, run: (m, report) => m.intoMeta(report) },
  /* 3 - jedes gebaute Paket liegt in drei Dateien und als Archiv vor, mit
         Manifest daneben; ob es schon abgeliefert war, steht dort. */
  { to: 3, run: (m, report) => m.wrapPackages(report) },
  /* 4 - die alten Wortnotizen sind weggeräumt, sofern der Wortvorrat
         jede einzelne kennt. */
  { to: 4, run: (m, report) => m.clearWords(report) }
];
const SCHEMA = STEPS[STEPS.length - 1].to;

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
    /* Höher als wir? Dort war eine neuere Fassung unterwegs - in Ruhe
       lassen, statt zurückzubauen. */
    if (at >= SCHEMA) return null;

    const report = {
      languages: 0, words: 0, moved: 0, kept: [],
      wrapped: 0, unwrapped: [], cleared: 0, uncleared: []
    };
    for (const step of STEPS) {
      if (at >= step.to) continue;
      await step.run(this, report);
      this.packager.settings.schema = step.to;
      await this.packager.saveSettings();
    }
    return report;
  }

  /* Die Sprachordner der Werkstatt. */
  languageFolders() {
    const root = this.packager.folder(this.packager.rootPath);
    if (!root) return [];
    return root.children.filter((child) => child instanceof TFolder && /^[a-z]{2,3}$/i.test(child.name));
  }

  /* Aus den Wortnotizen einer Sprache wird ihr Wortvorrat: eine Datei,
     ein Eintrag je Schlüssel.

     Die Notizen bleiben liegen. Sie werden zwar nicht mehr gelesen, aber
     wegwerfen kann man sie immer noch - und wer sie behält, kann
     nachsehen, ob der Umzug stimmt. */
  async wordsIntoDictionary(report) {
    for (const child of this.languageFolders()) {
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
    const known = this.packager.settings.schemas || {};

    for (const child of this.languageFolders()) {
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

  /* Jedes gebaute Paket in die heutige Form: Kopf, Text und Wörterbuch als
     drei Dateien, dazu das Archiv und das Manifest. Am Inhalt ändert sich
     nichts, also auch nicht an der Nummer.

     Zwei Dinge aus der alten Welt dürfen dabei nicht verloren gehen:

     Ob ein Paket schon abgeliefert war. Das stand bisher in den
     Einstellungen ("sent"); jetzt steht es im Manifest. Sonst leuchtete
     Deploy bei jedem Text, den die Person längst hinübergeschickt hat.

     Ob ein Paket veraltet war. Die alte Werkstatt erkannte das am Datum:
     War der Text oder die Werkbank jünger als das Paket, musste neu gebaut
     werden. Das Manifest hielte den heutigen Stand sonst für gebaut - und
     eine Änderung, die nie ins Paket kam, fiele unter den Tisch. Also
     wird, was damals jünger war, als verändert vermerkt.

     Ein Paket, das die heutige Prüfung nicht besteht, bleibt, wie es ist.
     Dann zeigt die Werkstatt Ingest, und die Person baut es neu. */
  async wrapPackages(report) {
    const sent = this.packager.settings.sent || {};

    for (const language of this.languageFolders()) {
      for (const child of language.children) {
        if (!(child instanceof TFolder)) continue;
        const head = this.packager.file(child.path + '/package.json');
        if (!head) continue;
        if (this.packager.file(child.path + '/manifest.json')) continue;

        const builtAt = head.stat.mtime;
        const younger = [];
        for (const name of ['text.md', 'work.md']) {
          const file = this.packager.file(child.path + '/' + name);
          if (file && file.stat.mtime > builtAt) younger.push(name);
        }

        const data = await this.packager.readBuilt(child);
        if (!data) {
          report.unwrapped.push(language.name + '/' + child.name);
          continue;
        }
        const refused = await this.packager.writeBuilt(child, data);
        if (refused.length > 0) {
          report.unwrapped.push(language.name + '/' + child.name);
          continue;
        }

        const path = child.path + '/manifest.json';
        const recorded = manifests.parse(await this.app.vault.read(this.packager.file(path)));
        if (recorded) {
          for (const name of younger) recorded.inputs[name] = 'changed before there were manifests';
          const delivered = Number(sent[data.id] || sent[child.path]) || 0;
          if (delivered > 0) recorded.deployed = { version: delivered, at: null, file: null };
          await this.packager.put(path, manifests.serialize(recorded));
        }
        report.wrapped += 1;
      }
    }

    /* Was die alte Buchführung wusste, steht jetzt in den Manifesten. */
    delete this.packager.settings.sent;
  }

  /* Die alten Wortnotizen wegräumen - aber nur, wenn der Wortvorrat jede
     einzelne von ihnen kennt. Fehlt auch nur eine, bleibt der Ordner
     liegen: Dann stimmt etwas nicht, und die Notizen sind das Einzige,
     woran man es nachprüfen kann.

     Weggeräumt wird in den Papierkorb, so wie die Person es in Obsidian
     eingestellt hat - von dort lässt es sich zurückholen. */
  async clearWords(report) {
    for (const language of this.languageFolders()) {
      const words = this.packager.folder(language.path + '/words');
      if (!words) continue;

      const file = this.packager.file(language.path + '/dictionary.json');
      if (!file) {
        report.uncleared.push(language.name);
        continue;
      }
      const dictionary = store.parse(await this.app.vault.read(file)).dictionary;
      const code = language.name.toLowerCase();

      let count = 0;
      let covered = true;
      for (const note of words.children) {
        if (!(note instanceof TFile) || note.extension !== 'md') continue;
        const made = store.fromNote(await this.app.vault.read(note), code);
        if (made && !Object.prototype.hasOwnProperty.call(dictionary, made.key)) {
          covered = false;
          break;
        }
        count += 1;
      }

      if (!covered) {
        report.uncleared.push(language.name);
        continue;
      }
      await this.app.fileManager.trashFile(words);
      report.cleared += count;
    }
  }
}

module.exports = { Migrations, SCHEMA };
