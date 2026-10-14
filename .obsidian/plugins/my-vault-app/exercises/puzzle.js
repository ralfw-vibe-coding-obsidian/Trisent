"use strict";

/*
 * Das Satzpuzzle - die Regeln, ohne Obsidian.
 *
 * Die Person sieht den Satz in ihrer Muttersprache und darunter die
 * Wörter des fremdsprachigen Originals als gemischte Kärtchen. Sie legt
 * sie in die richtige Reihenfolge. Geübt wird der Satzbau, ohne dass
 * Wörter erinnert oder geschrieben werden müssen.
 *
 * Die Kärtchen sind die Wörter des Pakets (units), in der Reihenfolge des
 * Satzes. Satzzeichen sind keine Kärtchen. Steht dasselbe Wort zweimal
 * im Satz ("de ... de"), sind die beiden austauschbar - verglichen wird
 * der Wortlaut, nicht das Kärtchen.
 *
 * Geprüft in tests/exercises-puzzle.test.js.
 */

/* Ein Wort, das mit einem Apostroph endet ("l'", "s'", "j'"), hängt am
   nächsten ohne Leerzeichen. */
function elided(text) {
  return /['’]$/.test(String(text || ''));
}

/* Die Kärtchen eines Satzes, in der Reihenfolge des Satzes.

   Das erste Wort verliert seinen Großbuchstaben - sonst verriete er,
   welches Kärtchen vorn hingehört. Eigennamen behalten ihn; die schreibt
   man immer groß. */
function tilesOf(sentence) {
  const source = String((sentence && sentence.source) || '');
  const units = ((sentence && sentence.units) || [])
    .filter((unit) => unit && Number.isInteger(unit.start) && Number.isInteger(unit.end) && unit.end > unit.start)
    .slice()
    .sort((a, b) => a.start - b.start);

  return units.map((unit, index) => {
    let text = unit.surface || source.slice(unit.start, unit.end);
    if (index === 0 && unit.partOfSpeech !== 'PROPN') {
      text = text.charAt(0).toLocaleLowerCase() + text.slice(1);
    }
    return { id: 't' + index, text: text, at: index };
  });
}

/* Fisher-Yates mit hereingereichtem Zufall - und nie genau die richtige
   Reihenfolge, solange es eine andere gibt. Sonst läge die Lösung
   schon da. */
function shuffleTiles(tiles, random) {
  const rnd = typeof random === 'function' ? random : Math.random;
  const words = (list) => list.map((tile) => same(tile.text)).join(' ');
  const original = words(tiles);
  const distinct = new Set(tiles.map((tile) => same(tile.text))).size > 1;

  let out = tiles.slice();
  for (let attempt = 0; attempt < 12; attempt++) {
    out = tiles.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const swap = out[i];
      out[i] = out[j];
      out[j] = swap;
    }
    if (!distinct || words(out) !== original) return out;
  }
  /* Der Zufall wollte nicht - dann eben das erste ans Ende. */
  return tiles.slice(1).concat(tiles.slice(0, 1));
}

/* Zum Vergleichen: ohne Groß und klein, gerade Apostrophe. */
function same(text) {
  return String(text || '').toLocaleLowerCase().replace(/’/g, "'");
}

/* Stimmt die gelegte Reihenfolge? placed: die Kärtchen in der
   Reihenfolge der Person. Liefert { correct, wrong: [Stellen] }. */
function checkOrder(placed, tiles) {
  const wanted = tiles.slice().sort((a, b) => a.at - b.at).map((tile) => same(tile.text));
  const wrong = [];
  placed.forEach((tile, index) => {
    if (same(tile.text) !== wanted[index]) wrong.push(index);
  });
  return { correct: wrong.length === 0 && placed.length === wanted.length, wrong: wrong };
}

/* Gelegte Kärtchen als Satz lesen - "l'" und "hôtel" ohne Lücke. */
function assemble(texts) {
  let out = '';
  for (const text of texts) {
    if (!out) out = text;
    else if (elided(out)) out += text;
    else out += ' ' + text;
  }
  return out;
}

module.exports = { tilesOf, shuffleTiles, checkOrder, assemble, elided };
