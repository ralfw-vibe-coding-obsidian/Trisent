"use strict";

/* Die richtige Form: welche Wörter fehlen, wie geprüft wird. */

const { test, is, ok, load } = require('./run.js');
const f = load('exercises/forms.js');

const u = (start, end, key, pos, lemma) => ({ start: start, end: end, key: key, partOfSpeech: pos, lemma: lemma });

/* "Julie habite à Paris avec ses amies." */
const satz = {
  source: 'Julie habite à Paris avec ses amies.',
  units: [
    u(0, 5, 'fr:julie:PROPN', 'PROPN', 'Julie'),
    u(6, 12, 'fr:habiter:VERB', 'VERB', 'habiter'),
    u(13, 14, 'fr:à:ADP', 'ADP', 'à'),
    u(15, 20, 'fr:paris:PROPN', 'PROPN', 'Paris'),
    u(21, 25, 'fr:avec:ADP', 'ADP', 'avec'),
    u(26, 29, 'fr:son:DET', 'DET', 'son'),
    u(30, 35, 'fr:ami:NOUN', 'NOUN', 'ami')
  ]
};

const still = () => 0.9999;

test('nur was anders aussieht als seine Grundform - Verben zuerst', () => {
  const task = f.buildForms(satz, {}, () => 'unknown', new Set(), still);
  is(task.gaps.length, 2, 'sieben Wörter - zwei Lücken');
  is(task.gaps[0], { answer: 'habite', lemma: 'habiter', key: 'fr:habiter:VERB' }, 'das Verb');
  ok(['amies', 'ses'].includes(task.gaps[1].answer), 'dann ein Nomen oder Artikel');
  ok(!task.gaps.some((gap) => ['Julie', 'Paris', 'avec', 'à'].includes(gap.answer)), 'nichts, was nichts zu beugen hat');
});

test('der Satz in Stücken behält Text und Satzzeichen', () => {
  const task = f.buildForms(satz, {}, () => 'unknown', new Set(), still);
  const text = task.parts.map((p) => (p.text !== undefined ? p.text : '___')).join('');
  ok(text.startsWith('Julie ___ à Paris'), 'Lücke an der Stelle des Verbs');
  ok(text.endsWith('.'), 'Punkt bleibt');
});

test('kurze Sätze bekommen eine Lücke', () => {
  const kurz = { source: 'Elle parle.', units: [u(0, 4, 'fr:elle:PRON', 'PRON', 'il'), u(5, 10, 'fr:parler:VERB', 'VERB', 'parler')] };
  const task = f.buildForms(kurz, {}, () => 'unknown', new Set(), still);
  is(task.gaps.length, 1, 'eine');
  is(task.gaps[0].answer, 'parle', 'das Verb');
});

test('ein Satz ohne Gebeugtes gibt keine Lücke', () => {
  const s = { source: 'Bonjour, Paris.', units: [u(0, 7, 'fr:bonjour:INTJ', 'INTJ', 'bonjour'), u(9, 14, 'fr:paris:PROPN', 'PROPN', 'Paris')] };
  is(f.buildForms(s, {}, () => 'unknown', new Set(), still).gaps, [], 'keine');
});

test('die Grundform kommt zur Not aus dem Wörterbuch oder dem Schlüssel', () => {
  is(f.lemmaOf({ key: 'fr:aller:VERB' }, { 'fr:aller:VERB': { lemma: 'aller' } }), 'aller', 'Wörterbuch');
  is(f.lemmaOf({ key: 'fr:aller:VERB' }, {}), 'aller', 'Schlüssel');
});

test('prüfen: ohne Groß und klein; ein fehlender Akzent zählt, wird aber gesagt', () => {
  is(f.checkForm('Habite', 'habite'), { right: true, accent: false }, 'richtig');
  is(f.checkForm('ete', 'été'), { right: true, accent: true }, 'Akzent fehlt');
  is(f.checkForm('habites', 'habite'), { right: false, accent: false }, 'falsche Endung');
  is(f.checkForm('', 'habite').right, false, 'leer');
  is(f.checkForm("l'", 'l’'), { right: true, accent: false }, 'Apostroph egal');
});
