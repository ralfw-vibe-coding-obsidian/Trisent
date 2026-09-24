"use strict";

/*
 * Das Manifest neben dem Paket.
 *
 * Aus ihm liest die Werkstatt, welcher Knopf gilt. Sieht es eine Änderung,
 * wo keine ist, drückt die Person umsonst; übersieht es eine, geht ein
 * veraltetes Paket hinaus.
 */

const { test, is, ok, report, load } = require('./run.js');
const manifest = load('packager/manifest.js');

test('derselbe Text, derselbe Fingerabdruck', () => {
  is(manifest.hashOf('Paul est là.'), manifest.hashOf('Paul est là.'), 'gleich');
});

test('ein einziges Leerzeichen ist eine Änderung', () => {
  ok(manifest.hashOf('Paul est là.') !== manifest.hashOf('Paul  est là.'), 'verschieden');
});

test('unverändert heißt: nichts zu tun', () => {
  const inputs = { 'text.md': 'a', 'work.md': 'b', 'audio/x.mp3': 100 };
  ok(manifest.isEmpty(manifest.compare(inputs, Object.assign({}, inputs))), 'leer');
});

test('neu, verschwunden, verändert werden auseinandergehalten', () => {
  const changes = manifest.compare(
    { 'text.md': 'a', 'audio/x.mp3': 100, 'audio/y.mp3': 200 },
    { 'text.md': 'b', 'audio/x.mp3': 100, 'audio/z.mp3': 300 }
  );
  is(changes.added, ['audio/z.mp3'], 'neu');
  is(changes.removed, ['audio/y.mp3'], 'verschwunden');
  is(changes.changed, ['text.md'], 'verändert');
});

test('in einem Satz gesagt', () => {
  is(manifest.describe(manifest.compare({ 'text.md': 'a' }, { 'text.md': 'b' })),
     'The text changed since the last package.', 'nur der Text');
  is(manifest.describe(manifest.compare(
       { 'text.md': 'a', 'work.md': 'b', 'audio/x.mp3': 1 },
       { 'text.md': 'x', 'work.md': 'y', 'audio/x.mp3': 2, 'audio/z.mp3': 3 })),
     'The text, the workbench and 2 recordings changed since the last package.', 'alles zusammen');
});

test('ein kaputtes Manifest gilt als nicht da', () => {
  is(manifest.parse('{ kaputt'), null, 'kein JSON');
  is(manifest.parse('{"version": 3}'), null, 'ohne Eingänge');
  is(manifest.parse('{"version": 3, "inputs": {}}').version, 3, 'ein gutes');
});

if (require.main === module) report();
