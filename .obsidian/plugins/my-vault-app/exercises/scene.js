"use strict";

/*
 * Das Puzzle über eine kleine Szene - die Regeln, ohne Obsidian.
 *
 * Drei aufeinanderfolgende Sätze einer Geschichte, deutsch untereinander,
 * und EIN Haufen mit allen fremdsprachigen Wörtern der drei. Die Person
 * muss nicht nur ordnen, sondern auch entscheiden, in welchen Satz ein
 * Wort gehört - ein "est" oder "la" passt womöglich in zwei.
 *
 * Eine Geschichte wird in Szenen zerlegt, die sich nicht überschneiden:
 * Sätze 1-3, 4-6, ... - mit einem Versatz, der von Sitzung zu Sitzung
 * wechseln darf, damit nicht immer dieselben Sätze zusammenstehen. Nur
 * Sätze, die in der Geschichte wirklich aufeinander folgen, bilden eine
 * Szene; fehlt einer dazwischen, entsteht dort keine.
 *
 * Geprüft in tests/exercises-scene.test.js.
 */

const { tilesOf, checkOrder } = require('./puzzle.js');

const SCENE = 3;

/* Szenen aus den übbaren Sätzen einer Geschichte (storyItems, schon
   gefiltert), beginnend beim Versatz 0, 1 oder 2.

   Liefert Einträge in der Form, die Draw und Session kennen: key, text,
   sentence (der erste), contextKeys (leer - Szenen überschneiden sich
   nicht) und scene: die drei Sätze. */
function sceneItems(items, offset) {
  const list = (items || []).slice().sort((a, b) => a.index - b.index);
  const start = Math.max(0, Math.trunc(Number(offset) || 0)) % SCENE;
  const out = [];
  let at = 0;
  /* Erst die Sätze vor dem Versatz überspringen. */
  while (at < list.length && list[at].index < (list[0] ? list[0].index : 0) + start) at++;
  while (at + SCENE <= list.length) {
    const group = list.slice(at, at + SCENE);
    const consecutive = group.every((item, n) => n === 0 || item.index === group[n - 1].index + 1);
    if (consecutive) {
      out.push({
        key: group[0].key + '+scene',
        text: group[0].text,
        index: group[0].index,
        sentence: group[0].sentence,
        contextKeys: [],
        scene: group
      });
      at += SCENE;
    } else {
      at += 1;
    }
  }
  return out;
}

/* Die Kärtchen einer Szene: je Satz die Kärtchen des Puzzles, mit einer
   Kennung, die über alle drei eindeutig ist. */
function sceneTiles(scene) {
  return scene.map((item, row) =>
    tilesOf(item.sentence).map((tile) => Object.assign({}, tile, { id: 'r' + row + tile.id, row: row })));
}

/* Alle drei Zeilen prüfen. placed: je Zeile die gelegten Kärtchen.
   Gleiche Wörter sind austauschbar - auch zwischen den Zeilen: Wer ein
   "est" aus dem zweiten Satz in den ersten legt, wo eins hingehört, hat
   es richtig gemacht. */
function checkScene(placed, tilesByRow) {
  const rows = tilesByRow.map((tiles, row) => checkOrder(placed[row] || [], tiles));
  return { correct: rows.every((row) => row.correct), rows: rows };
}

module.exports = { SCENE, sceneItems, sceneTiles, checkScene };
