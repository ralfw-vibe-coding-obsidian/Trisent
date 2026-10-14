"use strict";

/*
 * Aus Grundformen bauen - die Regeln, ohne Obsidian.
 *
 * Die Person sieht den Satz in ihrer Muttersprache und darunter die
 * Wörter des Originals in ihrer Grundform, in der Reihenfolge des Satzes:
 *
 *   Ich wohne in Paris.     je · habiter · à · Paris
 *
 * Sie schreibt den ganzen Satz: "J'habite à Paris." Finden muss sie
 * nichts mehr, nur beugen und zusammensetzen - die letzte Stufe vor dem
 * freien Übersetzen. Die Bausteine lassen sich ausblenden; dann ist es
 * Übersetzen aus dem Gedächtnis, verglichen mit dem Original.
 *
 * Geprüft wird ohne KI, Wort für Wort gegen das Original: ohne Groß und
 * klein, ohne Satzzeichen, ohne Akzente (fehlen nur Akzente, sagt es die
 * App dazu). Was nicht passt, wird gezeigt - in der Antwort die falschen
 * Wörter, im Original die verpassten.
 *
 * Geprüft in tests/exercises-build.test.js.
 */

const { unitsOf } = require('./gaps.js');
const { lemmaOf } = require('./forms.js');

/* Die Bausteine: je Wort seine Grundform, in der Reihenfolge des Satzes.
   Eigennamen bleiben, wie sie sind. */
function blocksOf(sentence, dictionary) {
  return unitsOf(sentence).map((unit) => {
    if (unit.partOfSpeech === 'PROPN') return unit.text;
    const lemma = lemmaOf(unit, dictionary) || unit.text;
    return String(lemma).toLocaleLowerCase();
  });
}

/* Ein Satz als Wörter: "J'habite à Paris." -> ["j'", "habite", "à",
   "paris"]. Das Apostroph bleibt am Wort davor - "j'" ist ein Wort. */
function wordsOf(text) {
  return (String(text || '').replace(/’/g, "'").match(/[\p{L}\p{N}]+'?/gu) || [])
    .map((word) => word.toLocaleLowerCase());
}

function bare(word) {
  return String(word || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/* Die längste gemeinsame Folge - welche Wörter beider Sätze einander
   entsprechen. Liefert je Wort, ob es einen Partner hat. */
function align(a, b) {
  const n = a.length;
  const m = b.length;
  const table = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = bare(a[i]) === bare(b[j])
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const inA = new Array(n).fill(false);
  const inB = new Array(m).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (bare(a[i]) === bare(b[j])) {
      inA[i] = true;
      inB[j] = true;
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return { inA: inA, inB: inB };
}

/* Die Antwort mit dem Original vergleichen.

   Liefert { correct, accent, typed: [{ word, ok }], original: [{ word,
   ok }] } - typed sind die Wörter der Person (ok: steht so im Original),
   original die des Originals (ok: hat sie getroffen). */
function compareSentence(typedText, originalText) {
  const typed = wordsOf(typedText);
  const original = wordsOf(originalText);
  const { inA, inB } = align(typed, original);
  const correct = typed.length > 0
    && typed.length === original.length
    && inA.every(Boolean) && inB.every(Boolean);
  const accent = correct && typed.some((word, index) => word !== original[index]);
  return {
    correct: correct,
    accent: accent,
    typed: typed.map((word, index) => ({ word: word, ok: inA[index] })),
    original: original.map((word, index) => ({ word: word, ok: inB[index] }))
  };
}

module.exports = { blocksOf, wordsOf, compareSentence };
