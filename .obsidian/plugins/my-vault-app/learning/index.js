"use strict";

/*
 * Die Learning-Seite als Ganzes.
 *
 * Reader und Translator sind zwei Werkzeuge derselben Person am selben
 * Material. Was sie sich teilen, liegt hier: die Bibliothek und der
 * Streak. Vorher hatte jedes Werkzeug seine eigene Bibliothek auf
 * demselben Ordner - zwei Zwischenspeicher für dieselben Dateien.
 *
 * Und hier liegt die VORDERTÜR: Der Packager reicht fertige Pakete an
 * `plugin.learning.importFiles()`. Absichtlich benannt nach dem Zweck und
 * nicht nach einem Werkzeug - `plugin.reader` hieße heute schon falsch,
 * und eine Umbenennung würde bei der Person erst dann brechen, wenn sie
 * "Deploy" drückt.
 *
 * Diese Datei gehört Reader und Translator gemeinsam. Änderungen am
 * Namen oder an der Form von `importFiles` betreffen auch den Packager.
 */

const { Library } = require('../core/library.js');
const { Streak } = require('./streak.js');

class Learning {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;

    /* Eine Bibliothek für beide Werkzeuge. */
    this.library = new Library(plugin.app, plugin, 'learning');

    /* Ein Zähler je Sprache, nicht je Werkzeug. */
    this.streak = new Streak(plugin.app);
  }

  /* Die einzige Tür in den Bereich der Lernenden.
   *
   * contents: Map von Pfad (relativ zum Paketordner) auf Bytes, also
   * mindestens 'package.json'. Geprüft wird dahinter, immer - ein Paket
   * vom Packager nimmt denselben Weg wie eine fremde ZIP-Datei. */
  importFiles(contents, label) {
    return this.library.importFiles(contents, label);
  }
}

module.exports = { Learning };
