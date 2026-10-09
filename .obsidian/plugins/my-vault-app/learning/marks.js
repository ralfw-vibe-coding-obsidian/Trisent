"use strict";

/*
 * Der Index - die Regeln, ohne Obsidian.
 *
 * Der Index ist die Sammlung der Wörter, die der Person aufgefallen sind:
 * beim Lesen oder beim Übersetzen. Keine Lernkartei - nichts wird
 * fällig, nichts türmt sich. Man blättert darin, wenn einem danach ist.
 *
 * Gemerkt wird in der Word note, als Eigenschaften, die man beim
 * Hineinschauen versteht:
 *
 *   indexCount: 3                  wie oft aufgenommen
 *   indexFrom: [reader, translator] wo es aufgefallen ist
 *   indexFirst: 2026-10-09T…Z      das erste Mal (UTC)
 *   indexLast:  2026-10-11T…Z      das letzte Mal (UTC)
 *   indexArchived: true            nur, wenn archiviert
 *
 * Ein Wort steht nur einmal im Index. Nimmt die Person es erneut auf,
 * zählt es hoch - eine Feststellung, kein Urteil: "darüber bin ich
 * schon siebenmal gestolpert". Archivieren blendet es aus, behält aber
 * alles; Löschen nimmt es ohne Spur heraus.
 *
 * Geprüft in tests/learning-marks.test.js.
 */

const ORIGINS = ['reader', 'translator'];

/* Was der Kopf einer Word note über den Index sagt - oder null, wenn
   das Wort nicht im Index steht. */
function markOf(fm) {
  if (!fm) return null;
  const count = Math.trunc(Number(fm.indexCount) || 0);
  if (count <= 0) return null;
  const from = (Array.isArray(fm.indexFrom) ? fm.indexFrom : [fm.indexFrom])
    .map((origin) => String(origin || ''))
    .filter((origin) => ORIGINS.includes(origin));
  return {
    count: count,
    from: ORIGINS.filter((origin) => from.includes(origin)),
    first: typeof fm.indexFirst === 'string' ? fm.indexFirst : '',
    last: typeof fm.indexLast === 'string' ? fm.indexLast : '',
    archived: fm.indexArchived === true || fm.indexArchived === 'true'
  };
}

/* Aufnehmen - auch ein zweites, drittes Mal. Ein archiviertes Wort, das
   wieder auffällt, kommt zurück in den Index. Ändert fm selbst (so will
   es processFrontMatter). */
function addMark(fm, origin, at) {
  const before = markOf(fm);
  const from = new Set(before ? before.from : []);
  if (ORIGINS.includes(origin)) from.add(origin);

  fm.indexCount = (before ? before.count : 0) + 1;
  fm.indexFrom = ORIGINS.filter((o) => from.has(o));
  fm.indexFirst = (before && before.first) || at;
  fm.indexLast = at;
  delete fm.indexArchived;
  return fm;
}

function archiveMark(fm) {
  if (markOf(fm)) fm.indexArchived = true;
  return fm;
}

function restoreMark(fm) {
  delete fm.indexArchived;
  return fm;
}

/* Ohne Spur heraus. Die Word note selbst bleibt - in ihr steht auch der
   Lernstand und was die Person notiert hat. */
function clearMark(fm) {
  for (const field of ['indexCount', 'indexFrom', 'indexFirst', 'indexLast', 'indexArchived']) {
    delete fm[field];
  }
  return fm;
}

/* Wie oft ein Wort in den Texten vorkommt: in wie vielen Sätzen und in
   wie vielen Texten. Einmal über alles, nicht je Wort.

   texts: [{ id, data }] - data mit paragraphs[].sentences[]. Ein Satz
   zählt für ein Wort einmal, auch wenn es zweimal darin steht. */
function frequencies(texts) {
  const out = new Map();
  for (const text of texts || []) {
    const seenIn = new Set();
    for (const paragraph of (text.data && text.data.paragraphs) || []) {
      for (const sentence of paragraph.sentences || []) {
        const keys = new Set();
        for (const unit of sentence.units || []) if (unit && unit.key) keys.add(unit.key);
        for (const phrase of sentence.phrases || []) if (phrase && phrase.key) keys.add(phrase.key);
        for (const key of keys) {
          let entry = out.get(key);
          if (!entry) {
            entry = { sentences: 0, texts: 0 };
            out.set(key, entry);
          }
          entry.sentences += 1;
          if (!seenIn.has(key)) {
            seenIn.add(key);
            entry.texts += 1;
          }
        }
      }
    }
  }
  return out;
}

/* Die Reihenfolgen des Index. Jede fällt bei Gleichstand auf das
   Alphabet zurück, damit nichts zufällig springt.

   item: { lemma, mark, freq: { sentences, texts } } */
const SORTS = [
  { id: 'recent', label: 'Recent' },
  { id: 'alphabetical', label: 'A–Z' },
  { id: 'stumbled', label: 'Most added' },
  { id: 'frequent', label: 'Most frequent' }
];

function compareItems(mode) {
  const abc = (a, b) => String(a.lemma).localeCompare(String(b.lemma), undefined, { sensitivity: 'base' });
  const freq = (item) => item.freq || { sentences: 0, texts: 0 };

  if (mode === 'alphabetical') return abc;
  if (mode === 'stumbled') {
    return (a, b) => (b.mark.count - a.mark.count) || String(b.mark.last).localeCompare(String(a.mark.last)) || abc(a, b);
  }
  if (mode === 'frequent') {
    return (a, b) => (freq(b).sentences - freq(a).sentences) || (freq(b).texts - freq(a).texts) || abc(a, b);
  }
  return (a, b) => String(b.mark.last).localeCompare(String(a.mark.last)) || abc(a, b);
}

module.exports = {
  ORIGINS, SORTS, markOf, addMark, archiveMark, restoreMark, clearMark, frequencies, compareItems
};
