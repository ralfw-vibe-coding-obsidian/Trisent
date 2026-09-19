"use strict";

/*
 * In der Kartei suchen.
 *
 * Steht hier und nicht in der Ansicht, weil es rechnet: Eine Suche, die
 * "chambre" nicht findet, wenn man "Chambre" tippt - oder "ete" nicht
 * bei "été" -, sieht aus wie eine leere Kartei. Man merkt es nicht, man
 * glaubt einfach, das Wort sei nicht drin.
 *
 * Geprüft wird in tests/flashcards-find.test.js.
 */

/* Groß/klein egal, Akzente egal, Apostrophe egal. Die Zerlegung in NFD
   trennt die Akzente vom Buchstaben, dann lassen sie sich wegwerfen -
   für Kyrillisch und Griechisch ändert das nichts, die Buchstaben tragen
   dort keine. */
function fold(text) {
  return String(text == null ? '' : text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’´`]/g, "'")
    .toLowerCase()
    .trim();
}

/* Gesucht wird in beidem: im Wort und in der Übersetzung. Wer "Zimmer"
   eingibt, meint dasselbe wie wer "chambre" eingibt. */
function matches(card, needle) {
  if (!needle) return true;
  const hay = fold(card.front) + '\n' + fold(card.back);
  return hay.indexOf(needle) >= 0;
}

function filter(cards, query) {
  const needle = fold(query);
  if (!needle) return cards.slice();
  return cards.filter((card) => matches(card, needle));
}

module.exports = { fold, matches, filter };
