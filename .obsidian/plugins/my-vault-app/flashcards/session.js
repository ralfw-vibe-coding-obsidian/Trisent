"use strict";

/*
 * Der Ablauf einer Übungssitzung: welche Karte gerade dran ist, was
 * "nochmal" mit dem Stapel macht, wann Schluss ist.
 *
 * Wie schedule.js kennt diese Datei weder Obsidian noch die Oberfläche.
 * Das ist derselbe Grund: Ein Stapel, der eine Karte verschluckt oder
 * eine doppelt zeigt, fällt beim Üben kaum auf - man denkt, man habe
 * sich verklickt. Geprüft wird in tests/flashcards-session.test.js.
 *
 * Was hier NICHT passiert: schreiben. Die Sitzung sagt nur, welcher
 * Stand herauskäme; festgehalten wird er draußen.
 */

const { rate, shuffle, today } = require('./schedule.js');

class Session {
  constructor(cards, options) {
    const settings = options || {};
    /* Gemischt, damit die Reihenfolge nicht mitgelernt wird - beim
       Wiederholen sonst ein bekanntes Muster statt eines Wortes. */
    this.queue = settings.shuffle === false ? cards.slice() : shuffle(cards, settings.random);
    this.total = this.queue.length;
    this.ask = settings.ask === 'back' ? 'back' : 'front';

    this.revealed = false;
    this.settled = 0;
    this.known = 0;
    this.unknown = 0;
    this.repeats = 0;
    /* Karten, die schon bewertet sind und nur zum Üben noch einmal
       kommen. Die Karten selbst, nicht ihre Schlüssel - so bleibt es
       dieselbe Karte, auch wenn ihr Stand inzwischen gespeichert ist. */
    this.practising = new Set();
  }

  /* Liegt gerade eine Karte zum Üben da - schon als "Not yet"
     festgehalten, nur noch einmal zum Ansehen? */
  get practice() {
    const card = this.card;
    return Boolean(card) && this.practising.has(card);
  }

  get card() {
    return this.queue.length > 0 ? this.queue[0] : null;
  }

  get done() {
    return this.queue.length === 0;
  }

  /* Die wievielte Karte gerade auf dem Tisch liegt - 1-basiert, damit
     "3 von 20" dasteht und nicht "2 von 20". Wiederholungen zählen
     nicht mit, sonst liefe der Fortschritt rückwärts. */
  get position() {
    return Math.min(this.settled + 1, this.total);
  }

  /* Was auf der Frageseite steht, was auf der Antwortseite. */
  get question() {
    const card = this.card;
    if (!card) return '';
    return this.ask === 'back' ? (card.back || '') : (card.front || card.key || '');
  }

  get answerText() {
    const card = this.card;
    if (!card) return '';
    return this.ask === 'back' ? (card.front || card.key || '') : (card.back || '');
  }

  reveal() {
    this.revealed = true;
  }

  /* Eine Karte bewerten. Liefert, was festzuhalten ist - oder null, wenn
     nichts festzuhalten ist.

     "nochmal" zählt wie "Not yet" - der Stand wird zurückgesetzt - und
     legt die Karte obendrein ans Ende des Stapels. Sie kommt in dieser
     Sitzung also wieder, aber nicht sofort, sonst wäre es Raten.

     Kommt sie wieder, ist sie schon festgehalten: Dann gibt es nur noch
     "nochmal" (wieder ans Ende) oder weiter. Ein "Knew it" fünf Karten
     später wäre kein Wissen, sondern Gedächtnis für die letzten Minuten -
     und würde das "Not yet" von eben überschreiben. */
  answer(kind, day) {
    const card = this.card;
    if (!card) return null;

    this.revealed = false;
    this.queue.shift();

    if (this.practising.has(card)) {
      if (kind === 'again') {
        this.queue.push(card);
        this.repeats++;
      }
      return null;
    }

    this.settled++;
    if (kind === 'known') this.known++;
    else this.unknown++;

    if (kind === 'again') {
      this.queue.push(card);
      this.practising.add(card);
      this.repeats++;
    }

    const rating = kind === 'again' ? 'unknown' : kind;
    return { card: card, state: rate(card, rating, day || today()) };
  }
}

module.exports = { Session };
