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
const { Importer } = require('./importer.js');
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

    /* Der eine Weg herein. */
    this.importer = new Importer(this);
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

  /* Die Tür für ein schon ausgepacktes Paket.
   *
   * contents: Map von Pfad (relativ zum Paketordner) auf Bytes, also
   * mindestens 'package.json'. Geprüft wird dahinter, immer - ein Paket
   * vom Packager nimmt denselben Weg wie eine fremde ZIP-Datei.
   *
   * Seit es importArchive() gibt, ist das nur noch Innenleben und die
   * Brücke für die Übergangszeit: Der Packager ruft es, bis er auf das
   * ZIP umgestellt hat. */
  importFiles(contents, label) {
    return this.importer.importContents(contents, label);
  }

  /* Die Vordertür für ein ZIP - genau das, was auch ein Fremder mitbringt.
   *
   * bytes: der Inhalt des Archivs, als ArrayBuffer oder Uint8Array.
   * label: wie es heißen soll, wenn eine Meldung davon spricht.
   *
   * Nimmt beide Fassungen des Paketformats. Dahinter derselbe Weg wie
   * importFiles(): prüfen, Wörterbuch einarbeiten, ablegen. */
  importArchive(bytes, label) {
    return this.importer.importArchive(bytes, label);
  }

  /* Liegt ein Paket in der Bibliothek, und in welcher Fassung?
   *
   * Liefert die Fassungsnummer (`version` aus dem Kopf, 0 wenn es keine
   * trägt) - oder null, wenn das Paket nicht da ist.
   *
   * Für den Packager, der wissen muss, ob ein Deploy nötig ist. Er soll
   * dafür nicht in den Bereich der Lernenden schauen: Wie die Ablage dort
   * aussieht, hat sich eben erst geändert und wird sich wieder ändern.
   * Die Frage gehört an die Tür, wie der Import auch. */
  async versionOf(id) {
    for (const language of this.library.languages()) {
      const found = await this.library.folderForPackageId(language, id);
      if (found) return typeof found.version === 'number' ? found.version : 0;
    }
    return null;
  }
}

module.exports = { Learning };
