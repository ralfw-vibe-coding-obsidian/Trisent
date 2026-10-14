"use strict";

/* Das Satzpuzzle: Kärtchen bilden, mischen, prüfen. */

const { test, is, ok, load } = require('./run.js');
const p = load('exercises/puzzle.js');

const satz = (source, units) => ({ source: source, units: units });
const u = (start, end, pos) => ({ start: start, end: end, partOfSpeech: pos || 'X' });

const hotel = satz("Bienvenue à l'hôtel Bellevue.", [
  u(0, 9, 'NOUN'), u(10, 11, 'ADP'), u(12, 14, 'DET'), u(14, 19, 'NOUN'), u(20, 28, 'PROPN')
]);

test('die Kärtchen sind die Wörter des Satzes, ohne Satzzeichen', () => {
  const tiles = p.tilesOf(hotel);
  is(tiles.map((t) => t.text), ['bienvenue', 'à', "l'", 'hôtel', 'Bellevue'], 'fünf Kärtchen');
});

test('das erste Wort verrät sich nicht durch den Großbuchstaben - Eigennamen schon', () => {
  is(p.tilesOf(satz('Paul voit Julie.', [u(0, 4, 'PROPN'), u(5, 9, 'VERB'), u(10, 15, 'PROPN')]))[0].text,
    'Paul', 'Eigenname bleibt groß');
  is(p.tilesOf(satz('Il y a.', [u(0, 2, 'PRON'), u(3, 4), u(5, 6)]))[0].text, 'il', 'sonst klein');
});

test('gemischt ist nie die Lösung, solange es anders geht', () => {
  const tiles = p.tilesOf(hotel);
  /* Ein Zufall, der nichts vertauscht - dann muss trotzdem etwas anders liegen. */
  const mixed = p.shuffleTiles(tiles, () => 0.9999);
  ok(mixed.map((t) => t.text).join(' ') !== tiles.map((t) => t.text).join(' '), 'nicht die Lösung');
  is(mixed.length, tiles.length, 'kein Kärtchen verloren');
});

test('ein Satz aus einem einzigen Wort lässt sich nicht mischen - und muss es auch nicht', () => {
  const tiles = p.tilesOf(satz('Bonjour.', [u(0, 7)]));
  is(p.shuffleTiles(tiles).length, 1, 'eins bleibt eins');
});

test('richtig gelegt', () => {
  const tiles = p.tilesOf(hotel);
  const result = p.checkOrder(tiles.slice(), tiles);
  ok(result.correct, 'richtig');
  is(result.wrong, [], 'keine falsche Stelle');
});

test('falsch gelegt: die falschen Stellen werden genannt', () => {
  const tiles = p.tilesOf(hotel);
  const placed = [tiles[1], tiles[0], tiles[2], tiles[3], tiles[4]];
  const result = p.checkOrder(placed, tiles);
  ok(!result.correct, 'falsch');
  is(result.wrong, [0, 1], 'die ersten beiden vertauscht');
});

test('gleiche Wörter sind austauschbar', () => {
  const s = satz('de la musique et de personnes', [u(0, 2), u(3, 5), u(6, 13), u(14, 16), u(17, 19), u(20, 29)]);
  const tiles = p.tilesOf(s);
  const placed = [tiles[4], tiles[1], tiles[2], tiles[3], tiles[0], tiles[5]];
  ok(p.checkOrder(placed, tiles).correct, 'die beiden "de" vertauscht ist trotzdem richtig');
});

test('noch nicht alle gelegt ist nicht richtig', () => {
  const tiles = p.tilesOf(hotel);
  ok(!p.checkOrder(tiles.slice(0, 3), tiles).correct, 'unvollständig');
});

test('als Satz gelesen: Apostroph ohne Lücke', () => {
  is(p.assemble(['bienvenue', 'à', "l'", 'hôtel', 'Bellevue']), "bienvenue à l'hôtel Bellevue", 'l\'hôtel');
  is(p.assemble(["s’", 'il', 'vous', 'plaît']), 's’il vous plaît', 'auch der gebogene');
});
