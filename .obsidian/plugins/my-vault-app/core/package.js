"use strict";

/*
 * Das Paketformat - der Vertrag zwischen Reader und Packager.
 *
 * Beschrieben ist es in konzept/paketformat.md. Wer hier etwas ändert,
 * ändert es für beide Seiten: Der Reader liest Pakete nach diesen Regeln,
 * der Packager schreibt sie danach. Deshalb gilt für diese Datei -
 * Änderungen nur im Einvernehmen, und die Spezifikation wandert mit.
 */

/* Der Dateiname, an dem ein Paketordner erkannt wird. */
const PACKAGE_FILE = 'package.json';

/* Die vier Wissensstände. Die Reihenfolge ist zugleich die
   Klick-Reihenfolge im Reader. */
const WORD_STATUS = ['unknown', 'learning', 'familiar', 'known'];

/* Gilt als lesbar ohne Hilfe. "learning" zählt bewusst nicht mit. */
const FLUENT_STATUS = ['familiar', 'known'];

/* Die Prüfregeln aus konzept/paketformat.md. Ein Paket, das hier
   durchfällt, kommt nicht in die Vault - lieber eine klare Fehlermeldung
   als ein Text, der später an einer Stelle kaputt ist. */
function validatePackage(data, fileNames) {
  const problems = [];
  const say = (text) => { if (problems.length < 40) problems.push(text); };

  if (!data || typeof data !== 'object') return ['The package file is not an object.'];
  if (data.schemaVersion !== 1) say('schemaVersion must be 1.');
  for (const field of ['id', 'title', 'language', 'glossLanguage', 'fluentLanguage']) {
    if (!data[field]) say('Missing "' + field + '" in the package header.');
  }
  if (!Array.isArray(data.paragraphs) || data.paragraphs.length === 0) {
    say('The package has no paragraphs.');
    return problems;
  }
  if (!data.dictionary || typeof data.dictionary !== 'object') {
    say('The package has no dictionary.');
    return problems;
  }

  const paragraphIds = new Set();
  const sentenceIds = new Set();
  const usedKeys = new Set();
  const keyByLexeme = new Map();

  for (const paragraph of data.paragraphs) {
    if (!paragraph.id) say('A paragraph has no id.');
    else if (paragraphIds.has(paragraph.id)) say('Duplicate paragraph id "' + paragraph.id + '".');
    paragraphIds.add(paragraph.id);

    for (const sentence of paragraph.sentences || []) {
      const at = 'Sentence "' + (sentence.id || '?') + '"';

      if (!sentence.id) say('A sentence has no id.');
      else if (sentenceIds.has(sentence.id)) say('Duplicate sentence id "' + sentence.id + '".');
      sentenceIds.add(sentence.id);

      if (typeof sentence.source !== 'string' || !sentence.source) say(at + ': no source text.');
      if (!sentence.fluent) say(at + ': no fluent translation.');

      const source = sentence.source || '';
      const units = Array.isArray(sentence.units) ? sentence.units : [];
      const starts = new Set();
      const ends = new Set();
      let previousEnd = 0;

      for (let i = 0; i < units.length; i++) {
        const unit = units[i];
        if (source.slice(unit.start, unit.end) !== unit.surface) {
          say(at + ', word ' + (i + 1) + ': "' + unit.surface + '" is not at that position in the source.');
        }
        if (unit.start < previousEnd) say(at + ', word ' + (i + 1) + ': words overlap or are out of order.');
        previousEnd = unit.end;
        starts.add(unit.start);
        ends.add(unit.end);

        for (const field of ['gloss', 'lemma', 'partOfSpeech', 'key']) {
          if (!unit[field]) say(at + ', word ' + (i + 1) + ' ("' + unit.surface + '"): "' + field + '" is missing.');
        }
        if (unit.key) {
          usedKeys.add(unit.key);
          const lexeme = String(unit.lemma).toLowerCase() + '|' + unit.partOfSpeech;
          const known = keyByLexeme.get(lexeme);
          if (known && known !== unit.key) {
            say('"' + unit.lemma + '" (' + unit.partOfSpeech + ') uses two different keys: "' + known + '" and "' + unit.key + '".');
          } else keyByLexeme.set(lexeme, unit.key);
        }
      }

      let previousPhraseEnd = 0;
      for (const phrase of sentence.phrases || []) {
        const label = '"' + (phrase.surface || '?') + '"';
        if (source.slice(phrase.start, phrase.end) !== phrase.surface) {
          say(at + ', phrase ' + label + ': not at that position in the source.');
        }
        if (!starts.has(phrase.start) || !ends.has(phrase.end)) {
          say(at + ', phrase ' + label + ': does not start and end on word boundaries.');
        }
        const inside = units.filter((u) => u.start >= phrase.start && u.end <= phrase.end);
        if (inside.length < 2) say(at + ', phrase ' + label + ': covers fewer than two words.');
        if (phrase.start < previousPhraseEnd) say(at + ', phrase ' + label + ': phrases overlap.');
        previousPhraseEnd = phrase.end;
        for (const field of ['gloss', 'lemma', 'key']) {
          if (!phrase[field]) say(at + ', phrase ' + label + ': "' + field + '" is missing.');
        }
        if (phrase.key) usedKeys.add(phrase.key);
      }

      if (sentence.audio && sentence.audio.file && !fileNames.has(sentence.audio.file)) {
        say(at + ': the audio file "' + sentence.audio.file + '" is not in the package.');
      }
    }
  }

  for (const key of usedKeys) {
    if (!data.dictionary[key]) say('No dictionary entry for "' + key + '".');
  }
  for (const key of Object.keys(data.dictionary)) {
    if (!usedKeys.has(key)) say('The dictionary entry "' + key + '" is never used.');
  }

  return problems;
}

/* Wortart-Tags sind fürs Datenformat gedacht, nicht fürs Lesen. */


/* Wortart-Tags sind fürs Datenformat gedacht, nicht fürs Lesen. */
const POS_LABELS = {
  NOUN: 'noun', PROPN: 'name', VERB: 'verb', AUX: 'auxiliary', ADJ: 'adjective',
  ADV: 'adverb', PRON: 'pronoun', DET: 'determiner', ADP: 'preposition',
  NUM: 'number', CCONJ: 'conjunction', SCONJ: 'conjunction', PART: 'particle',
  INTJ: 'interjection', PHRASE: 'phrase'
};

function readablePos(tag) {
  return POS_LABELS[tag] || String(tag).toLowerCase();
}

/* Der paketübergreifende Wissensschlüssel. Diese eine Funktion hält alle
   Pakete zusammen: Gleiche Grundform und Wortart ergeben denselben
   Schlüssel - und damit denselben Lernstand, über alle Texte hinweg.
   Bildet der Packager ihn anders als der Reader ihn erwartet, zerfällt
   der Lernstand unbemerkt in zwei Hälften. */
function keyFor(language, lemma, partOfSpeech, sense) {
  const base = String(language).toLowerCase() + ':' +
               String(lemma).toLowerCase() + ':' + partOfSpeech;
  return sense ? base + ':' + sense : base;
}

module.exports = {
  PACKAGE_FILE,
  WORD_STATUS,
  FLUENT_STATUS,
  POS_LABELS,
  validatePackage,
  readablePos,
  keyFor
};
