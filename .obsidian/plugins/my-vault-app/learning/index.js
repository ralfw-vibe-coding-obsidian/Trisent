"use strict";

/*
 * Die Learning-Seite als Ganzes.
 *
 * Reader, Translator und Lernkartei sind Werkzeuge derselben Person am
 * selben Material. Was sie sich teilen, liegt hier: die Bibliothek, der
 * Streak und die Kartei. Vorher hatte jedes Werkzeug seine eigene Bibliothek auf
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
const { Deck } = require('../flashcards/deck.js');
const { Dictionary } = require('./dictionary.js');
const { Migrations, describe } = require('./migrations.js');
const { log } = require('../core/log.js');

class Learning {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;

    /* Eine Bibliothek für beide Werkzeuge. */
    this.library = new Library(plugin.app, plugin, 'learning');

    /* Ein Zähler je Sprache, nicht je Werkzeug. */
    this.streak = new Streak(plugin.app);

    /* Das Wörterbuch der Person: eine Datei je Sprache, gefüllt durch
       die Importe. Ab hier kommt jede Worterklärung von hier - im Text,
       auf der Word card, auf der Flashcard. */
    this.dictionary = new Dictionary(plugin.app, this.library);

    /* Wer es von Hand ändert, soll das auch sehen. */
    plugin.registerEvent(
      plugin.app.vault.on('modify', (file) => this.dictionary.forget(file && file.path))
    );

    /* Die Lernkartei. Der Reader legt Karten hinein, die Kartei fragt sie
       ab - also gehört sie keinem von beiden allein. */
    this.deck = new Deck(plugin.app, this.library);
  }

  /* Vorhandene Notizen auf das heutige Schema bringen. Läuft einmal je
     Vault, beim Start - siehe migrations.js. */
  async migrate() {
    const report = await new Migrations(this.plugin, this).run();

    /* Eine Meldung steht ein paar Sekunden da. Der Umbau schreibt aber in
       hunderte Notizen der Person - das muss sie auch später noch
       nachlesen können. */
    const text = describe(report);
    if (text) await log(this.plugin, 'Learning', text);

    return report;
  }

  /* Was dabei geschah, als Satz für die Person - oder nichts. */
  describeMigration(report) {
    return describe(report);
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
