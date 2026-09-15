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

  /* Der Schlüssel darf keine freie Angabe sein, sondern muss aus Grundform
     und Wortart FOLGEN. Sonst können zwei Pakete unbemerkt auseinander-
     laufen, und der Lernstand der Person zerfällt in zwei Hälften.

     So wandert der Fehler dorthin, wo man ihn sehen kann: auf die Wahl der
     Grundform. Ein Bedeutungszusatz (bg:ключ:NOUN:spring) ist erlaubt -
     geprüft wird der Teil davor. */
  const checkKey = (where, key, lemma, partOfSpeech) => {
    if (!lemma || !partOfSpeech) return;
    const expected = keyFor(data.language, lemma, partOfSpeech);
    if (key === expected || String(key).startsWith(expected + ':')) return;
    say(where + ': the key "' + key + '" does not follow from lemma "' + lemma +
        '" and part of speech "' + partOfSpeech + '". Expected "' + expected + '".');
  };

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
        if (unit.partOfSpeech && !POS_TAGS.includes(unit.partOfSpeech)) {
          say(at + ', word ' + (i + 1) + ' ("' + unit.surface + '"): "' + unit.partOfSpeech +
              '" is not one of the allowed parts of speech.');
        }
        if (unit.key) {
          usedKeys.add(unit.key);
          checkKey(at + ', word ' + (i + 1) + ' ("' + unit.surface + '")',
                   unit.key, unit.lemma, unit.partOfSpeech);
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
        if (phrase.key) {
          usedKeys.add(phrase.key);
          checkKey(at + ', phrase ' + label, phrase.key, phrase.lemma, 'PHRASE');
        }
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

/* Die vierzehn erlaubten Wortarten. Ein Tippfehler im Tag erzeugt sonst
   still einen zweiten Schlüssel für dasselbe Wort. */
const POS_TAGS = [
  'NOUN', 'PROPN', 'VERB', 'AUX', 'ADJ', 'ADV', 'PRON',
  'DET', 'ADP', 'NUM', 'CCONJ', 'SCONJ', 'PART', 'INTJ'
];

/* Was in einen Schlüssel eingeht, wird vorher vereinheitlicht.

   Zwei Fälle, die sonst unbemerkt zwei Karteikarten für dasselbe Wort
   erzeugen:

   - "é" kann ein Zeichen sein oder zwei (e + Akzent). Beides sieht gleich
     aus, ist als Zeichenkette aber verschieden.
   - Der Apostroph kommt gerade (') und typografisch (’) vor. Derselbe
     Text aus zwei Quellen schreibt "s'il" und "s’il". */
function normalizeForKey(text) {
  return String(text)
    .normalize('NFC')
    .replace(/[\u2019\u2018\u02BC]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/* Der paketübergreifende Wissensschlüssel. Diese eine Funktion hält alle
   Pakete zusammen: Gleiche Grundform und Wortart ergeben denselben
   Schlüssel - und damit denselben Lernstand, über alle Texte hinweg.

   Benutze sie, statt den Schlüssel selbst zusammenzusetzen. Zwei Pakete,
   die ihn unterschiedlich bilden, zerlegen den Lernstand der Person in
   zwei Hälften, und niemand merkt es - es sieht nur so aus, als käme sie
   langsamer voran, als sie es tut. */
function keyFor(language, lemma, partOfSpeech, sense) {
  const base =
    normalizeForKey(language) + ':' +
    normalizeForKey(lemma) + ':' +
    String(partOfSpeech).trim().toUpperCase();
  return sense ? base + ':' + normalizeForKey(sense) : base;
}

module.exports = {
  PACKAGE_FILE,
  POS_TAGS,
  normalizeForKey,
  WORD_STATUS,
  FLUENT_STATUS,
  POS_LABELS,
  validatePackage,
  readablePos,
  keyFor
};
