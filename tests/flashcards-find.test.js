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
