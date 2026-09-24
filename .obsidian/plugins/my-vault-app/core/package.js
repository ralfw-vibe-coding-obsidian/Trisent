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

/* Die zweite Fassung teilt das Paket in drei Dateien: Kopf, Text und
   Wörterbuch. Siehe konzept/paketformat.md. */
const TEXT_FILE = 'text.json';
const DICTIONARY_FILE = 'dictionary.json';

/* Höher kommt kein Bauplan. Eine größere Zahl am Eintrag ist kein
   Fortschritt, sondern ein Fehler - und ein gefährlicher: Da beim Import
   die höhere Nummer gewinnt, hielte sie den Eintrag im Wörterbuch der
   Person für immer fest, und niemand sähe, warum die Erklärung nicht
   mehr besser wird. */
const MAX_ENTRY_SCHEMA = 1000;

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
  /* Die zweite Fassung wird hier in ihrer zusammengesetzten Form geprüft
     (siehe joinPackage) - dieselben Regeln, dieselbe Sicht auf das Ganze.
     Für die erste Fassung ändert sich nichts. */
  if (data.schemaVersion !== 1 && data.schemaVersion !== 2) {
    say('schemaVersion must be 1 or 2.');
  }
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
  /* Zeitmarken zeigen beim Abspielen, welches Wort gerade klingt. Eine
     Marke, die auf das falsche Wort zeigt, ist schlimmer als gar keine -
     man liest dann beim Hören an der falschen Stelle mit. Deshalb lieber
     das Paket ablehnen als eine Marke geradebiegen.

     Lücken sind ausdrücklich erlaubt: Nicht jedes Wort muss eine Marke
     haben, und "unit" ist der Index in "units", nicht die Position in
     dieser Liste. */
  const checkTimings = (where, audio, unitCount) => {
    if (!Array.isArray(audio.timings)) return;

    const seen = new Set();
    let previousEnd = -1;

    for (let i = 0; i < audio.timings.length; i++) {
      const mark = audio.timings[i];
      const at = where + ', timing ' + (i + 1);

      if (!Number.isInteger(mark.unit) || mark.unit < 0 || mark.unit >= unitCount) {
        say(at + ': "unit" is not a word of this sentence.');
        continue;
      }
      if (seen.has(mark.unit)) {
        say(at + ': word ' + (mark.unit + 1) + ' already has a timing.');
        continue;
      }
      seen.add(mark.unit);

      if (typeof mark.startMs !== 'number' || typeof mark.endMs !== 'number') {
        say(at + ': "startMs" and "endMs" must be numbers.');
        continue;
      }
      if (mark.startMs < 0 || mark.endMs < mark.startMs) {
        say(at + ': the timing ends before it starts.');
        continue;
      }
      if (mark.startMs < previousEnd) {
        say(at + ': timings overlap or are out of order.');
      }
      previousEnd = mark.endMs;

      if (typeof audio.durationMs === 'number' && mark.endMs > audio.durationMs) {
        say(at + ': the timing runs past the end of the recording.');
      }
    }
  };

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

      if (sentence.audio && sentence.audio.file) {
        if (!fileNames.has(sentence.audio.file)) {
          say(at + ': the audio file "' + sentence.audio.file + '" is not in the package.');
        }
        checkTimings(at, sentence.audio, units.length);
      }
    }
  }

  for (const key of usedKeys) {
    if (!data.dictionary[key]) say('No dictionary entry for "' + key + '".');
  }
  for (const key of Object.keys(data.dictionary)) {
    if (!usedKeys.has(key)) say('The dictionary entry "' + key + '" is never used.');

    const entry = data.dictionary[key];
    if (entry && entry.entrySchema !== undefined) {
      const number = entry.entrySchema;
      if (!Number.isInteger(number) || number < 0 || number > MAX_ENTRY_SCHEMA) {
        say('The dictionary entry "' + key + '" has an impossible entrySchema: ' +
            JSON.stringify(number) + '. It must be a whole number from 0 to ' + MAX_ENTRY_SCHEMA + '.');
      }
    }
  }

  return problems;
}

/* ------------------------------------------------------------------ */
/* Die zweite Fassung: drei Dateien                                    */
/* ------------------------------------------------------------------ */

/* Aus Kopf, Text und Wörterbuch die eine Form machen, die validatePackage
   prüft. Die Dateien bleiben getrennt; das hier ist nur die Sicht auf das
   Ganze. */
function joinPackage(head, text, dictionary) {
  const joined = Object.assign({}, head);
  joined.paragraphs = text && Array.isArray(text.paragraphs) ? text.paragraphs : [];
  joined.dictionary = dictionary && typeof dictionary === 'object' && !Array.isArray(dictionary)
    ? dictionary
    : {};
  return joined;
}

/* Umgekehrt: ein Paket in die drei Dateien teilen. */
function splitPackage(data) {
  const head = {};
  for (const field of Object.keys(data)) {
    if (field === 'paragraphs' || field === 'dictionary') continue;
    head[field] = data[field];
  }
  head.schemaVersion = 2;
  return {
    head: head,
    text: { paragraphs: data.paragraphs || [] },
    dictionary: data.dictionary || {}
  };
}

/* Ein Paket der zweiten Fassung prüfen, so wie es ausgepackt vorliegt:
   Pfad (relativ zum Paket) -> Inhalt, als Text oder Bytes.

   Liefert { data, problems }. Ist "problems" leer, ist "data" das
   zusammengesetzte Paket. Pakete der ersten Fassung gehen nicht hier
   durch, sondern wie bisher direkt durch validatePackage. */
function validateParts(files) {
  const problems = [];
  const read = (name) => {
    if (!files.has(name)) {
      problems.push('There is no ' + name + ' in the package.');
      return null;
    }
    const raw = files.get(name);
    const text = typeof raw === 'string' ? raw : new TextDecoder('utf-8').decode(raw);
    try {
      return JSON.parse(text.replace(/^\uFEFF/, ''));
    } catch (error) {
      problems.push(name + ' is not valid JSON: ' + String(error.message || error));
      return null;
    }
  };

  const head = read(PACKAGE_FILE);
  const text = read(TEXT_FILE);
  const dictionary = read(DICTIONARY_FILE);
  if (problems.length > 0) return { data: null, problems: problems };

  if (!head || typeof head !== 'object') {
    return { data: null, problems: ['The package header is not an object.'] };
  }
  if (head.schemaVersion !== 2) {
    return { data: null, problems: ['schemaVersion must be 2 for a package in three files.'] };
  }
  /* Steht der Text oder das Wörterbuch auch im Kopf, wäre nicht klar,
     welches gilt. */
  if (head.paragraphs !== undefined || head.dictionary !== undefined) {
    return {
      data: null,
      problems: ['The package header must not carry "paragraphs" or "dictionary" - they belong in ' +
                 TEXT_FILE + ' and ' + DICTIONARY_FILE + '.']
    };
  }

  const data = joinPackage(head, text, dictionary);
  const found = validatePackage(data, new Set(files.keys()));
  return { data: found.length > 0 ? null : data, problems: found };
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
  TEXT_FILE,
  DICTIONARY_FILE,
  MAX_ENTRY_SCHEMA,
  joinPackage,
  splitPackage,
  validateParts,
  POS_TAGS,
  normalizeForKey,
  WORD_STATUS,
  FLUENT_STATUS,
  POS_LABELS,
  validatePackage,
  readablePos,
  keyFor
};
