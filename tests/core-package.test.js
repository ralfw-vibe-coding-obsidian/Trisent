"use strict";

/*
 * Der Vertrag zwischen Werkstatt und Bibliothek: die Prüfung eines Pakets.
 *
 * Hier hängt die Zusage an die Learning-Seite dran, dass die erste Fassung
 * genau wie bisher geprüft wird - ihre Migration liest damit die
 * vorhandenen Pakete, bevor sie sie umschreibt. Und die zweite Fassung,
 * die aus drei Dateien besteht.
 */

const { test, is, ok, report, load } = require('./run.js');
const pkg = load('core/package.js');

/* Das kleinste Paket, das durch die Prüfung gehen muss. */
function sample() {
  return {
    schemaVersion: 1,
    id: 'fr-probe',
    version: 1,
    title: 'Probe',
    language: 'fr',
    glossLanguage: 'de',
    fluentLanguage: 'de',
    paragraphs: [{
      id: 'p001',
      sentences: [{
        id: 's001',
        source: 'Paul est là.',
        fluent: 'Paul ist da.',
        units: [
          { start: 0, end: 4, surface: 'Paul', gloss: 'Paul', lemma: 'Paul', partOfSpeech: 'PROPN', key: 'fr:paul:PROPN' },
          { start: 5, end: 8, surface: 'est', gloss: 'ist', lemma: 'être', partOfSpeech: 'VERB', key: 'fr:être:VERB' },
          { start: 9, end: 11, surface: 'là', gloss: 'da', lemma: 'là', partOfSpeech: 'ADV', key: 'fr:là:ADV' }
        ]
      }]
    }],
    dictionary: {
      'fr:paul:PROPN': { lemma: 'Paul', partOfSpeech: 'PROPN', gloss: 'Paul' },
      'fr:être:VERB': { lemma: 'être', partOfSpeech: 'VERB', gloss: 'sein', entrySchema: 1 },
      'fr:là:ADV': { lemma: 'là', partOfSpeech: 'ADV', gloss: 'da' }
    }
  };
}

function asFiles(parts, extra) {
  const files = new Map();
  files.set('package.json', JSON.stringify(parts.head));
  files.set('text.json', JSON.stringify(parts.text));
  files.set('dictionary.json', JSON.stringify(parts.dictionary));
  for (const [name, value] of extra || []) files.set(name, value);
  return files;
}

test('die erste Fassung geht durch wie bisher', () => {
  is(pkg.validatePackage(sample(), new Set()), [], 'keine Probleme');
});

test('eine unbekannte Fassung fällt durch', () => {
  const data = sample();
  data.schemaVersion = 3;
  ok(pkg.validatePackage(data, new Set()).some((one) => /schemaVersion/.test(one)), 'gemeldet');
});

test('teilen und zusammensetzen ergibt dasselbe Paket', () => {
  const data = sample();
  const parts = pkg.splitPackage(data);

  is(parts.head.schemaVersion, 2, 'der Kopf sagt: zweite Fassung');
  ok(parts.head.paragraphs === undefined, 'kein Text im Kopf');
  ok(parts.head.dictionary === undefined, 'kein Wörterbuch im Kopf');

  const joined = pkg.joinPackage(parts.head, parts.text, parts.dictionary);
  is(joined.paragraphs, data.paragraphs, 'der Text');
  is(joined.dictionary, data.dictionary, 'das Wörterbuch');
  is(joined.title, 'Probe', 'der Titel');
});

test('drei Dateien, geprüft wie eine', () => {
  const result = pkg.validateParts(asFiles(pkg.splitPackage(sample())));
  is(result.problems, [], 'keine Probleme');
  is(result.data.id, 'fr-probe', 'das zusammengesetzte Paket');
});

test('fehlt eine der drei Dateien, wird sie benannt', () => {
  const files = asFiles(pkg.splitPackage(sample()));
  files.delete('dictionary.json');
  const result = pkg.validateParts(files);
  is(result.data, null, 'kein Paket');
  ok(result.problems.some((one) => /dictionary\.json/.test(one)), 'die fehlende Datei genannt');
});

test('eine kaputte Datei wirft nicht, sie meldet', () => {
  const files = asFiles(pkg.splitPackage(sample()));
  files.set('text.json', '{ kaputt');
  const result = pkg.validateParts(files);
  ok(result.problems.some((one) => /text\.json is not valid JSON/.test(one)), 'gemeldet');
});

test('Text im Kopf ist zweideutig und fällt durch', () => {
  const parts = pkg.splitPackage(sample());
  parts.head.paragraphs = [];
  const result = pkg.validateParts(asFiles(parts));
  ok(result.problems.some((one) => /must not carry/.test(one)), 'gemeldet');
});

test('Bytes statt Text werden auch gelesen, samt BOM', () => {
  const parts = pkg.splitPackage(sample());
  const files = asFiles(parts);
  files.set('text.json', new TextEncoder().encode('﻿' + JSON.stringify(parts.text)));
  is(pkg.validateParts(files).problems, [], 'keine Probleme');
});

test('eine Tonspur, die im Paket fehlt, fällt auch in drei Dateien auf', () => {
  const data = sample();
  data.paragraphs[0].sentences[0].audio = { file: 'audio/s001.mp3', durationMs: 1000 };
  const parts = pkg.splitPackage(data);

  ok(pkg.validateParts(asFiles(parts)).problems.some((one) => /audio file/.test(one)), 'ohne Datei: gemeldet');
  is(pkg.validateParts(asFiles(parts, [['audio/s001.mp3', new Uint8Array([1])]])).problems, [], 'mit Datei: gut');
});

test('eine unmögliche Bauplannummer fällt durch', () => {
  for (const bad of [999999, -1, 1.5, '2']) {
    const data = sample();
    data.dictionary['fr:là:ADV'].entrySchema = bad;
    ok(pkg.validatePackage(data, new Set()).some((one) => /entrySchema/.test(one)), JSON.stringify(bad) + ' abgelehnt');
  }
});

test('eine fehlende Bauplannummer ist erlaubt - sie zählt als null', () => {
  const data = sample();
  delete data.dictionary['fr:être:VERB'].entrySchema;
  is(pkg.validatePackage(data, new Set()), [], 'keine Probleme');
});

if (require.main === module) report();
