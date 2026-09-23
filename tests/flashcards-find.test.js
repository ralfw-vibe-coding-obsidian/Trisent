"use strict";

/* Die Suche in der Kartei. Ein Fehler hier sieht nicht aus wie ein
   Fehler: Man tippt ein Wort, es kommt nichts, und man glaubt, die Karte
   sei gar nicht da. */

const { test, is, ok, load } = require('./run.js');
const f = load('flashcards/find.js');

const card = (front, back) => ({ front: front, back: back, key: 'fr:' + front + ':NOUN' });

const deck = () => [
  card('chambre', 'Zimmer'),
  card('été', 'Sommer'),
  card("s'il vous plaît", 'bitte'),
  card('Étage', 'Stockwerk'),
  card('градина', 'Garten')
];

const namen = (cards) => cards.map((c) => c.front);

test('Groß- und Kleinschreibung ist egal', () => {
  is(namen(f.filter(deck(), 'CHAMBRE')), ['chambre'], 'ganz groß');
  is(namen(f.filter(deck(), 'Chambre')), ['chambre'], 'am Anfang groß');
  is(namen(f.filter(deck(), 'étage')), ['Étage'], 'die Karte ist groß');
});

test('Akzente sind egal, in beide Richtungen', () => {
  is(namen(f.filter(deck(), 'ete')), ['été'], 'ohne Akzent gesucht');
  is(namen(f.filter(deck(), 'été')), ['été'], 'mit Akzent gesucht');
  is(namen(f.filter(deck(), 'Etage')), ['Étage'], 'beides zusammen');
});

test('typografische und gerade Apostrophe sind dasselbe', () => {
  is(namen(f.filter(deck(), "s'il")), ["s'il vous plaît"], 'gerade');
  is(namen(f.filter(deck(), 's’il')), ["s'il vous plaît"], 'typografisch');
});

test('gesucht wird auch in der Übersetzung', () => {
  is(namen(f.filter(deck(), 'Zimmer')), ['chambre'], 'deutsches Wort');
  is(namen(f.filter(deck(), 'garten')), ['градина'], 'auch bei kyrillisch');
});

test('ein Stück des Wortes reicht', () => {
  is(namen(f.filter(deck(), 'amb')), ['chambre'], 'mitten im Wort');
});

test('Kyrillisch bleibt unangetastet', () => {
  is(f.fold('Градина'), 'градина', 'nur klein geschrieben');
  is(namen(f.filter(deck(), 'градин')), ['градина'], 'gefunden');
});

test('ohne Suchbegriff bleibt alles stehen', () => {
  is(f.filter(deck(), '').length, 5, 'leer');
  is(f.filter(deck(), '   ').length, 5, 'nur Leerzeichen');
  is(f.filter(deck(), null).length, 5, 'nichts');
});

test('was es nicht gibt, kommt auch nicht', () => {
  is(f.filter(deck(), 'xyz').length, 0, 'nichts gefunden');
});

test('die Suche baut keine neue Reihenfolge', () => {
  const cards = deck();
  const gefunden = f.filter(cards, 'e');
  is(gefunden, gefunden.slice().sort(() => 0), 'Reihenfolge wie im Bestand');
  is(cards.length, 5, 'der Bestand bleibt unberührt');
});

test('Karten ohne Übersetzung bringen die Suche nicht um', () => {
  const stumm = [{ front: 'mot', back: null, key: 'fr:mot:NOUN' }, { key: 'fr:x:NOUN' }];
  is(namen(f.filter(stumm, 'mot')), ['mot'], 'gefunden');
  is(f.filter(stumm, 'nichts').length, 0, 'und nichts Falsches');
});

/* ------------------------------------------------------------------ */
/* Seitenweise                                                        */
/* ------------------------------------------------------------------ */

const zahlen = (n) => Array.from({ length: n }, (_, i) => i + 1);

test('eine volle Seite wird geschnitten', () => {
  const s = f.page(zahlen(10), 0, 4);
  is(s.items, [1, 2, 3, 4], 'die ersten vier');
  is(s.page, 0, 'Seite null');
  is(s.pages, 3, 'drei Seiten');
  is(s.from, 1, 'von');
  is(s.to, 4, 'bis');
  is(s.count, 10, 'insgesamt');
});

test('die letzte Seite darf angebrochen sein', () => {
  const s = f.page(zahlen(10), 2, 4);
  is(s.items, [9, 10], 'der Rest');
  is(s.from, 9, 'von');
  is(s.to, 10, 'bis - nicht 12');
});

test('eine Seite, die es nicht gibt, wird zur letzten', () => {
  const s = f.page(zahlen(10), 7, 4);
  is(s.page, 2, 'auf die letzte gerückt');
  is(s.items, [9, 10], 'und deren Inhalt');
});

test('eine leere Liste hat trotzdem eine Seite', () => {
  const s = f.page([], 3, 4);
  is(s.items, [], 'nichts');
  is(s.pages, 1, 'eine Seite');
  is(s.page, 0, 'die erste');
  is(s.from, 0, 'von null');
  is(s.to, 0, 'bis null');
});

test('Unsinn bringt die Rechnung nicht um', () => {
  is(f.page(zahlen(5), -3, 2).page, 0, 'negative Seite');
  is(f.page(zahlen(5), 1, 0).items.length, 1, 'Seitengröße null ergibt eine je Seite');
  is(f.page(null, 0, 4).items, [], 'gar keine Liste');
});

test('jede Karte kommt auf genau einer Seite vor', () => {
  const alle = [];
  const bestand = zahlen(23);
  for (let at = 0; at < f.page(bestand, 0, 5).pages; at++) {
    for (const item of f.page(bestand, at, 5).items) alle.push(item);
  }
  is(alle, bestand, 'vollständig und ohne Doppelte');
});
