"use strict";

/*
 * Wo ein Wort sonst noch vorkommt.
 *
 * GEMEINSAM für die Lernwerkzeuge. Der Reader zeigt damit die anderen
 * Stellen in der Wortkarte, die Lernkartei die Beispielsätze auf der
 * Rückseite. Beide suchen dasselbe und müssen dasselbe finden - sonst
 * erklärt die eine Seite ein Wort mit einem Satz, den die andere nicht
 * kennt.
 *
 * Gesucht wird über den Wissensschlüssel, nie über den Wortlaut: Nur der
 * Schlüssel weiß, dass "suis" und "être" dasselbe Wort sind.
 */

/* Alle Einheiten und Wendungen eines Satzes, die zu diesem Schlüssel
   gehören. Ein Wort kann in einem Satz mehrfach vorkommen. */
function matchesIn(sentence, key) {
  const found = [];
  for (const unit of sentence.units || []) {
    if (unit.key === key) found.push(unit);
  }
  for (const phrase of sentence.phrases || []) {
    if (phrase.key === key) found.push(phrase);
  }
  return found;
}

/* Eine Fundstelle, wie beide Seiten sie brauchen: der Satz in drei
   Teilen, damit die Stelle hervorgehoben werden kann, ohne im Text zu
   suchen - die Zeichenpositionen stehen ja schon in der Einheit. */
function occurrenceOf(sentence, item, where) {
  const source = sentence.source || '';
  return {
    before: source.slice(0, item.start),
    hit: source.slice(item.start, item.end),
    after: source.slice(item.end),
    fluent: sentence.fluent || '',
    sentence: sentence.id,
    title: where ? where.title : null,
    path: where ? where.path : null
  };
}

/* Alle Sätze eines schon geladenen Paketes durchsehen. */
function searchData(data, key, where, into) {
  const found = into || [];
  for (const paragraph of data.paragraphs || []) {
    for (const sentence of paragraph.sentences || []) {
      for (const item of matchesIn(sentence, key)) {
        found.push(occurrenceOf(sentence, item, where));
      }
    }
  }
  return found;
}

/* Die Pakete einer Sprache durchsehen. Liest von der Platte, dauert also
   einen Moment - die Oberfläche zeigt derweil, was sie schon hat.
 *
 * skipPath: ein Paket auslassen (der Reader hat das offene schon).
 * limit:    aufhören, sobald genug beisammen ist. Für die Kartei, die
 *           nur drei Beispiele zeigt, ist das der Unterschied zwischen
 *           einem Paket und allen. */
async function searchPackages(library, language, key, options) {
  const settings = options || {};
  const limit = settings.limit > 0 ? settings.limit : Infinity;
  const found = [];

  for (const folder of library.packagesOf(language)) {
    if (settings.skipPath && folder.path === settings.skipPath) continue;

    const entry = await library.loadPackage(folder);
    if (!entry || !entry.ok) continue;

    searchData(
      entry.data, key,
      { title: entry.data.title || folder.name, path: folder.path },
      found
    );

    if (found.length >= limit) return found.slice(0, limit);
  }

  return found;
}

module.exports = { matchesIn, occurrenceOf, searchData, searchPackages };
