"use strict";

/* Die Wörter eines Textes: sammeln, filtern, ordnen. */

const { test, is, ok, load } = require('./run.js');
const w = load('reader/words.js');

const unit = (key, surface, extra) => Object.assign({ key: key, surface: surface }, extra);

const data = {
  paragraphs: [{
    sentences: [
      { source: 'Paul va au café.', units: [
        unit('fr:paul:PROPN', 'Paul'), unit('fr:aller:VERB', 'va'),
        unit('fr:café:NOUN', 'café')
      ] },
      { source: 'Ils vont au café.', units: [
        unit('fr:ils:PRON', 'Ils'), unit('fr:aller:VERB', 'vont'), unit('fr:café:NOUN', 'café')
      ], phrases: [{ key: 'fr:il y a:EXPR', surface: 'il y a' }] }
    ]
  }]
};

const dictionary = {
  'fr:aller:VERB': { lemma: 'aller', partOfSpeech: 'VERB', gloss: 'gehen' },
  'fr:café:NOUN': { lemma: 'café', partOfSpeech: 'NOUN', gloss: 'der Kaffee, das Café' },
  'fr:paul:PROPN': { lemma: 'Paul', partOfSpeech: 'PROPN', gloss: 'Paul' },
  'fr:ils:PRON': { lemma: 'ils', partOfSpeech: 'PRON', gloss: 'sie' }
};

const status = { 'fr:aller:VERB': 'learning', 'fr:café:NOUN': 'known', 'fr:ils:PRON': 'familiar' };
const statusOf = (key) => status[key];

test('jedes Wort einmal, mit seinen Formen und wie oft', () => {
  const rows = w.collectWords(data, dictionary, statusOf, new Set());
  const aller = rows.find((row) => row.key === 'fr:aller:VERB');
  is(aller.forms, ['va', 'vont'], 'beide Formen');
  is(aller.count, 2, 'zweimal');
  is(aller.gloss, 'gehen', 'aus dem Wörterbuch');
  const cafe = rows.find((row) => row.key === 'fr:café:NOUN');
  is(cafe.forms, ['café'], 'eine Form, nicht doppelt');
  is(cafe.count, 2, 'aber zweimal gezählt');
  is(rows.length, 5, 'vier Wörter und eine Wendung');
});

test('Lernstand: ohne Eintrag unbekannt', () => {
  const rows = w.collectWords(data, dictionary, statusOf, new Set());
  is(rows.find((row) => row.key === 'fr:paul:PROPN').status, 'unknown', 'Paul hat keinen');
  is(rows.find((row) => row.key === 'fr:aller:VERB').status, 'learning', 'aller lernt man');
});

test('Wendungen gehören dazu', () => {
  const rows = w.collectWords(data, dictionary, statusOf, new Set());
  const phrase = rows.find((row) => row.phrase);
  is(phrase.lemma, 'il y a', 'Grundform aus dem Schlüssel');
  is(phrase.forms, ['il y a'], 'wie sie dasteht');
});

test('die Form steht auch ohne surface, aus der Stelle im Satz', () => {
  const rows = w.collectWords({ paragraphs: [{ sentences: [
    { source: 'Paul va.', units: [{ key: 'fr:aller:VERB', start: 5, end: 7 }] }
  ] }] }, dictionary, statusOf, new Set());
  is(rows[0].forms, ['va'], 'aus start/end');
});

test('filtern nach Lernstand - nichts gewählt heißt alles', () => {
  const rows = w.collectWords(data, dictionary, statusOf, new Set());
  is(w.filterWords(rows, []).length, 5, 'alles');
  is(w.filterWords(rows, ['unknown']).map((r) => r.lemma).sort(), ['Paul', 'il y a'], 'nur rote');
  is(w.filterWords(rows, ['learning', 'familiar']).map((r) => r.lemma).sort(), ['aller', 'ils'], 'gelbe und graue');
});

test('Wörter im Index zuerst, dann alphabetisch nach der vorderen Spalte', () => {
  const rows = w.collectWords(data, dictionary, statusOf, new Set(['fr:café:NOUN']));
  is(w.sortWords(rows, 'foreign').map((r) => r.lemma), ['café', 'aller', 'il y a', 'ils', 'Paul'], 'nach der Fremdsprache');
  is(w.sortWords(rows, 'native').map((r) => r.lemma), ['café', 'aller', 'Paul', 'ils', 'il y a'],
    'nach der Übersetzung: gehen, Paul, sie - ohne Übersetzung ans Ende');
});
