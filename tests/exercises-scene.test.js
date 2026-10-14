"use strict";

/* Das Puzzle über eine Szene: Szenen bilden, prüfen. */

const { test, is, ok, load } = require('./run.js');
const sc = load('exercises/scene.js');
const pr = load('translator/practice.js');

const satz = (n, words) => {
  let at = 0;
  const units = words.map((word) => {
    const unit = { start: at, end: at + word.length, partOfSpeech: 'X' };
    at += word.length + 1;
    return unit;
  });
  return { id: 's' + n, source: words.join(' '), units: units };
};

const geschichte = (n) => pr.storyItems('t', Array.from({ length: n }, (_, i) => satz(i + 1, ['mot' + (i + 1), 'est'])));

test('Szenen aus je drei Sätzen, ohne Überschneidung', () => {
  const scenes = sc.sceneItems(geschichte(7), 0);
  is(scenes.map((s) => s.scene.map((x) => x.sentence.id)), [['s1', 's2', 's3'], ['s4', 's5', 's6']], 'zwei Szenen, s7 bleibt übrig');
  is(scenes[0].contextKeys, [], 'kein Zusammenhang nötig');
  is(scenes[0].text, 't', 'die Geschichte');
});

test('der Versatz verschiebt die Szenen', () => {
  const scenes = sc.sceneItems(geschichte(7), 1);
  is(scenes.map((s) => s.scene[0].sentence.id), ['s2', 's5'], 'ab dem zweiten Satz');
});

test('zu kurze Geschichten haben keine Szene', () => {
  is(sc.sceneItems(geschichte(2), 0), [], 'zwei Sätze reichen nicht');
});

test('nur Sätze, die wirklich aufeinander folgen', () => {
  const items = geschichte(6).filter((item) => item.sentence.id !== 's2');
  const scenes = sc.sceneItems(items, 0);
  is(scenes.map((s) => s.scene.map((x) => x.sentence.id)), [['s3', 's4', 's5']], 'über die Lücke hinweg keine Szene');
});

test('Kärtchen je Zeile, mit eindeutiger Kennung', () => {
  const scene = sc.sceneItems(geschichte(3), 0)[0].scene;
  const tiles = sc.sceneTiles(scene);
  is(tiles.length, 3, 'drei Zeilen');
  const ids = tiles.flat().map((t) => t.id);
  is(new Set(ids).size, ids.length, 'keine Kennung doppelt');
});

test('prüfen: gleiche Wörter dürfen die Zeile wechseln', () => {
  const tiles = sc.sceneTiles(sc.sceneItems(geschichte(3), 0)[0].scene);
  /* Das "est" aus Zeile 2 in Zeile 1, und umgekehrt. */
  const placed = [[tiles[0][0], tiles[1][1]], [tiles[1][0], tiles[0][1]], [tiles[2][0], tiles[2][1]]];
  const result = sc.checkScene(placed, tiles);
  ok(result.correct, 'richtig');
});

test('prüfen: ein Wort in der falschen Zeile', () => {
  const tiles = sc.sceneTiles(sc.sceneItems(geschichte(3), 0)[0].scene);
  const placed = [[tiles[1][0], tiles[0][1]], [tiles[0][0], tiles[1][1]], [tiles[2][0], tiles[2][1]]];
  const result = sc.checkScene(placed, tiles);
  ok(!result.correct, 'falsch');
  is(result.rows.map((r) => r.correct), [false, false, true], 'die ersten beiden Zeilen');
});
