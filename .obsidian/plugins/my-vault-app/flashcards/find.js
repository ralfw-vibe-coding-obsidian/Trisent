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

/* Wie viele Karten auf eine Seite gehen. Bei drei Spalten sind das acht
   Reihen - genug, um sich umzusehen, wenig genug, um nicht zu rollen,
   bis man vergessen hat, wonach man suchte. */
const PAGE = 24;

/* Eine Seite aus einer Liste schneiden.

   Robust gegen eine Seitenzahl, die es nicht mehr gibt: Wer auf Seite 5
   steht und dann sucht, landet auf der letzten vorhandenen Seite statt
   vor einer leeren Liste. Die zurückgegebene `page` ist die, die
   wirklich gilt - der Aufrufer übernimmt sie. */
function page(items, at, size) {
  const all = Array.isArray(items) ? items : [];
  const perPage = Math.max(Math.trunc(Number(size) || 0), 1);
  const pages = Math.max(Math.ceil(all.length / perPage), 1);
  const current = Math.min(Math.max(Math.trunc(Number(at) || 0), 0), pages - 1);
  const from = current * perPage;

  return {
    items: all.slice(from, from + perPage),
    page: current,
    pages: pages,
    count: all.length,
    /* Von-bis zum Anzeigen, 1-basiert. Bei nichts bleibt es bei 0. */
    from: all.length === 0 ? 0 : from + 1,
    to: Math.min(from + perPage, all.length)
  };
}

module.exports = { fold, matches, filter, page, PAGE };
