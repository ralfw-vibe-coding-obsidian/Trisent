"use strict";

/*
 * Die Learning-Seite als Ganzes.
 *
 * Reader, Translator und Lernkartei sind Werkzeuge derselben Person am
 * selben Material. Was sie sich teilen, liegt hier: die Bibliothek, der
 * Streak und die Kartei. Vorher hatte jedes Werkzeug seine eigene Bibliothek auf
 * demselben Ordner - zwei Zwischenspeicher für dieselben Dateien.
 *
 * Und hier liegt der IMPORT: Pakete kommen ausschließlich über die Inbox
 * herein, als ZIP. Mit der Werkstatt teilt diese Seite keine Funktion,
 * nur den Ordner und die Dateiform - siehe inbox.js.
 *
 * Diese Datei gehört Reader und Translator gemeinsam.
 */

const { Library } = require('../core/library.js');
const { Streak } = require('./streak.js');
const { Deck } = require('../flashcards/deck.js');
const { Dictionary } = require('./dictionary.js');
const { Importer } = require('./importer.js');
const { Inbox } = require('./inbox.js');
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

    /* Der eine Weg herein: aus der Inbox, durch die Prüfung. */
    this.importer = new Importer(this);
    this.inbox = new Inbox(this);
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

  /* Wie viele Pakete in der Inbox warten. Sofort, ohne zu lesen - für
     den Knopf, der es anzeigt. */
  waitingInInbox() {
    return this.inbox.waiting().length;
  }

  /* Alles importieren, was in der Inbox liegt. Liefert { done, failed }. */
  importInbox() {
    return this.inbox.importAll();
  }
}

module.exports = { Learning };
