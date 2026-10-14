"use strict";

/* Aus Grundformen bauen: Bausteine, Wörter, Vergleich mit dem Original. */

const { test, is, ok, load } = require('./run.js');
const b = load('exercises/build.js');

const u = (start, end, key, pos, lemma) => ({ start: start, end: end, key: key, partOfSpeech: pos, lemma: lemma });

const satz = {
  source: "J'habite à Paris.",
  units: [
    u(0, 2, 'fr:je:PRON', 'PRON', 'je'),
    u(2, 8, 'fr:habiter:VERB', 'VERB', 'habiter'),
    u(9, 10, 'fr:à:ADP', 'ADP', 'à'),
    u(11, 16, 'fr:paris:PROPN', 'PROPN', 'Paris')
  ]
};

test('die Bausteine: Grundformen in der Reihenfolge des Satzes, Namen bleiben', () => {
  is(b.blocksOf(satz, {}), ['je', 'habiter', 'à', 'Paris'], 'je · habiter · à · Paris');
});

test('Wörter eines Satzes - das Apostroph bleibt am Wort davor', () => {
  is(b.wordsOf("J'habite à Paris."), ["j'", 'habite', 'à', 'paris'], 'ohne Satzzeichen');
  is(b.wordsOf('« Moi aussi ! »'), ['moi', 'aussi'], 'Anführungszeichen weg');
  is(b.wordsOf('s’il vous plaît'), ["s'", 'il', 'vous', 'plaît'], 'gebogenes Apostroph');
});

test('richtig: ohne Groß und klein und Satzzeichen', () => {
  const r = b.compareSentence("j'habite à paris", "J'habite à Paris.");
  ok(r.correct, 'richtig');
  ok(!r.accent, 'kein Akzent fehlt');
});

test('nur Akzente fehlen: richtig, aber gesagt', () => {
  const r = b.compareSentence("j'habite a paris", "J'habite à Paris.");
  ok(r.correct, 'richtig');
  ok(r.accent, 'Akzent fehlt');
});

test('falsche Form: das Wort ist in der Antwort rot, im Original verpasst', () => {
  const r = b.compareSentence("j'habit à Paris", "J'habite à Paris.");
  ok(!r.correct, 'falsch');
  is(r.typed.map((w) => w.ok), [true, false, true, true], 'habit passt nicht');
  is(r.original.map((w) => w.ok), [true, false, true, true], 'habite verpasst');
});

test('ein Wort fehlt, eins zu viel', () => {
  const r = b.compareSentence('Paul est à la fête avec amis', 'Paul est à une fête avec ses amis.');
  ok(!r.correct, 'falsch');
  is(r.typed.filter((w) => !w.ok).map((w) => w.word), ['la'], 'la statt une');
  is(r.original.filter((w) => !w.ok).map((w) => w.word), ['une', 'ses'], 'une und ses verpasst');
});

test('eine leere Antwort ist nicht richtig', () => {
  ok(!b.compareSentence('', 'Bonjour.').correct, 'leer');
});
