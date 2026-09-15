"use strict";

/*
 * Aus einer Werkbank-Notiz ein Paket rechnen.
 *
 * Die Arbeitsteilung dieser Datei ist der ganze Witz des Packagers:
 * In work.md steht ausschließlich Sprachwissen - Satz, Wort, Glosse,
 * Grundform, Wortart. Keine einzige Zahl. Alles Mechanische entsteht
 * hier: Zeichenpositionen, laufende Nummern, Schlüssel, Wörterbuch.
 *
 * Eine KI kann Zeichen nicht zuverlässig abzählen, ein Programm schon.
 * Also zählt niemand ab - die Wörter stehen in Lesereihenfolge, und
 * gesucht wird der Reihe nach ab dem Ende des vorigen Wortes.
 */

const { keyFor, validatePackage, POS_TAGS } = require('../core/package.js');

/* ------------------------------------------------------------------ */
/* Notizen lesen                                                       */
/* ------------------------------------------------------------------ */

/* Frontmatter und Körper trennen. Wir parsen selbst, statt Obsidians
   Index zu fragen: Notizen, die gerade erst geschrieben wurden, kennt
   der Index noch nicht. */
function splitNote(text) {
  const clean = String(text).replace(/^﻿/, '');
  const match = clean.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { front: {}, body: clean };
  return { front: parseFrontMatter(match[1]), body: match[2] };
}

/* Genug YAML für unsere Zwecke: Text, Anführungszeichen, [a, b, c]. */
function parseFrontMatter(block) {
  const result = {};
  for (const line of block.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((piece) => unquote(piece.trim()))
        .filter((piece) => piece !== '');
    } else {
      value = unquote(value);
    }
    result[match[1]] = value;
  }
  return result;
}

function unquote(text) {
  if (text.length > 1 && text[0] === '"' && text[text.length - 1] === '"') {
    return text.slice(1, -1).replace(/\\"/g, '"');
  }
  return text;
}

/* Eine Wortnotiz aus dem Wortvorrat des Packagers. */
function parseWordNote(text) {
  const { front, body } = splitNote(text);
  const grammar = body.match(/##\s*Grammar\s*\r?\n([\s\S]*?)(?=\r?\n##\s|$)/);
  return {
    lemma: front.lemma || '',
    partOfSpeech: front.partOfSpeech || '',
    key: front.key || '',
    gloss: front.gloss || '',
    forms: Array.isArray(front.forms) ? front.forms : front.forms ? [front.forms] : [],
    grammar: grammar ? grammar[1].trim() : ''
  };
}

/* ------------------------------------------------------------------ */
/* Die Werkbank-Notiz                                                  */
/* ------------------------------------------------------------------ */

/*  Satzblock:     Originalsatz
 *                 : flüssige Übersetzung
 *                     Wort · Glosse · Grundform · WORTART
 *                   + Wendung · Glosse [· Grundform]
 *
 *  "---" allein   trennt Absätze
 *  "@ Name"       Sprecher des folgenden Absatzes
 */
function parseWork(text) {
  const { front, body } = splitNote(text);

  const paragraphs = [];
  let paragraph = null;
  let sentence = null;

  const closeSentence = () => {
    if (sentence) paragraph.sentences.push(sentence);
    sentence = null;
  };
  const closeParagraph = () => {
    closeSentence();
    if (paragraph && paragraph.sentences.length > 0) paragraphs.push(paragraph);
    paragraph = null;
  };
  const openParagraph = () => {
    if (!paragraph) paragraph = { speaker: '', sentences: [] };
  };

  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    const at = i + 1;

    if (line === '') continue;

    if (/^-{3,}$/.test(line)) {
      closeParagraph();
      continue;
    }

    if (line.startsWith('@ ')) {
      closeParagraph();
      openParagraph();
      paragraph.speaker = line.slice(2).trim();
      continue;
    }

    if (line.startsWith(': ')) {
      if (sentence) sentence.fluent = line.slice(2).trim();
      continue;
    }

    if (line.startsWith('+ ')) {
      if (sentence) {
        const parts = splitFields(line.slice(2));
        sentence.phrases.push({
          surface: parts[0] || '',
          gloss: parts[1] || '',
          lemma: parts[2] || parts[0] || '',
          line: at
        });
      }
      continue;
    }

    /* Eine eingerückte Zeile mit Trennzeichen ist ein Wort. */
    if (/^\s/.test(raw) && line.indexOf('·') >= 0) {
      if (sentence) {
        const parts = splitFields(line);
        sentence.units.push({
          surface: parts[0] || '',
          gloss: parts[1] || '',
          lemma: parts[2] || '',
          partOfSpeech: (parts[3] || '').toUpperCase(),
          line: at
        });
      }
      continue;
    }

    /* Alles andere beginnt einen neuen Satz. */
    closeSentence();
    openParagraph();
    sentence = { source: line, fluent: '', units: [], phrases: [], line: at };
  }
  closeParagraph();

  return { head: front, paragraphs: paragraphs };
}

function splitFields(line) {
  return line.split('·').map((piece) => piece.trim());
}

/* ------------------------------------------------------------------ */
/* Bauen                                                               */
/* ------------------------------------------------------------------ */

function pad(n) {
  return String(n).padStart(3, '0');
}

/*  work      Ergebnis von parseWork()
 *  original  Inhalt von text.md, oder null
 *  words     Map von Schlüssel auf Wortnotiz
 *  version   Nummer der neuen Fassung
 *
 *  Zurück kommt { data, problems, missing, stats }. Ist "problems" leer,
 *  ist "data" ein gültiges Paket.
 */
function buildPackage(work, original, words, version) {
  const problems = [];
  const missing = [];
  const say = (text) => { if (problems.length < 40) problems.push(text); };

  const head = work.head || {};
  const language = String(head.language || '').toLowerCase();
  if (!language) say('The work note has no "language" in its front matter.');
  if (!head.id) say('The work note has no "id" in its front matter.');
  if (!head.title) say('The work note has no "title" in its front matter.');

  const usedKeys = new Set();
  const seenForms = new Map();
  /* Was der Text über einen Schlüssel verrät. Fehlt die Wortnotiz, ist
     genau das der Anhalt, aus dem sie geschrieben wird. */
  const about = new Map();
  let sentenceNumber = 0;
  let unitCount = 0;
  let phraseCount = 0;

  const paragraphs = work.paragraphs.map((paragraph, index) => {
    const sentences = paragraph.sentences.map((sentence) => {
      sentenceNumber += 1;
      const id = 's' + pad(sentenceNumber);
      const source = sentence.source;
      const at = 'Line ' + sentence.line + ' (' + shorten(source) + ')';

      if (!sentence.fluent) say(at + ': there is no translation line starting with ": ".');
      if (sentence.units.length === 0) say(at + ': no words listed.');

      /* Der Kern: Wörter der Reihe nach suchen statt Zeichen zu zählen. */
      let cursor = 0;
      const units = [];
      for (const unit of sentence.units) {
        const start = source.indexOf(unit.surface, cursor);
        if (start < 0) {
          say(
            'Line ' + unit.line + ': "' + unit.surface + '" does not appear in the sentence' +
            (source.indexOf(unit.surface) >= 0 ? ' after the previous word - are the words out of order?' : '.')
          );
          continue;
        }
        const end = start + unit.surface.length;
        cursor = end;

        for (const field of ['gloss', 'lemma', 'partOfSpeech']) {
          if (!unit[field]) say('Line ' + unit.line + ' ("' + unit.surface + '"): the ' + field + ' is missing.');
        }
        if (unit.partOfSpeech && POS_TAGS.indexOf(unit.partOfSpeech) < 0) {
          say('Line ' + unit.line + ' ("' + unit.surface + '"): "' + unit.partOfSpeech + '" is not a known part of speech.');
          continue;
        }
        if (!unit.lemma || !unit.partOfSpeech) continue;

        const key = keyFor(language, unit.lemma, unit.partOfSpeech);
        usedKeys.add(key);
        remember(seenForms, key, unit.surface);
        note(about, key, unit.lemma, unit.partOfSpeech, unit.surface, unit.gloss, source);
        unitCount += 1;

        units.push({
          start: start,
          end: end,
          surface: unit.surface,
          gloss: unit.gloss,
          lemma: unit.lemma,
          partOfSpeech: unit.partOfSpeech,
          key: key
        });
      }

      /* Wendungen müssen auf Wortgrenzen liegen - deshalb wird die
         Stelle gesucht, die zu einem Wortanfang passt. */
      const phrases = [];
      for (const phrase of sentence.phrases) {
        let start = -1;
        let from = 0;
        for (;;) {
          const found = source.indexOf(phrase.surface, from);
          if (found < 0) break;
          if (units.some((u) => u.start === found)) { start = found; break; }
          from = found + 1;
        }
        if (start < 0) {
          say('Line ' + phrase.line + ': the phrase "' + phrase.surface + '" does not start on a word in this sentence.');
          continue;
        }
        const end = start + phrase.surface.length;
        if (!units.some((u) => u.end === end)) {
          say('Line ' + phrase.line + ': the phrase "' + phrase.surface + '" does not end on a word boundary.');
          continue;
        }
        if (!phrase.gloss) say('Line ' + phrase.line + ' ("' + phrase.surface + '"): the gloss is missing.');

        const key = keyFor(language, phrase.lemma, 'PHRASE');
        usedKeys.add(key);
        remember(seenForms, key, phrase.surface);
        note(about, key, phrase.lemma, 'PHRASE', phrase.surface, phrase.gloss, source);
        phraseCount += 1;

        phrases.push({
          start: start,
          end: end,
          surface: phrase.surface,
          gloss: phrase.gloss,
          lemma: phrase.lemma,
          key: key
        });
      }

      const built = { id: id, source: source, fluent: sentence.fluent, units: units };
      if (phrases.length > 0) built.phrases = phrases;
      return built;
    });

    const built = { id: 'p' + pad(index + 1), sentences: sentences };
    if (paragraph.speaker) built.speaker = paragraph.speaker;
    return built;
  });

  /* Stimmen die Sätze noch mit dem Originaltext überein? Sobald jemand
     einen Satz abtippt statt ihn zu kopieren, gehen die typografischen
     Zeichen verloren - und danach steht kein Wort mehr an seiner Stelle. */
  if (original) {
    let cursor = 0;
    for (const paragraph of paragraphs) {
      for (const sentence of paragraph.sentences) {
        const found = original.indexOf(sentence.source, cursor);
        if (found < 0) {
          say('Sentence ' + sentence.id + ' does not appear in text.md - was it typed instead of copied?');
          cursor = original.length;
          break;
        }
        if (original.slice(cursor, found).trim()) {
          say('Between ' + sentence.id + ' and the sentence before it, a piece of text.md is missing.');
        }
        cursor = found + sentence.source.length;
      }
    }
    if (original.slice(cursor).trim()) {
      say('The end of text.md is not covered by any sentence.');
    }
  }

  /* Das Wörterbuch entsteht aus dem Wortvorrat - vollständig, auch für
     Wörter, die in jedem Text vorkommen. Ein Paket muss in einer fremden
     Vault funktionieren, in der nichts davon bekannt ist. */
  const dictionary = {};
  for (const key of Array.from(usedKeys).sort()) {
    const note = words.get(key);
    if (!note) { missing.push(key); continue; }

    const forms = note.forms.slice();
    for (const form of seenForms.get(key) || []) {
      if (forms.indexOf(form) < 0) forms.push(form);
    }

    const entry = {
      lemma: note.lemma,
      partOfSpeech: note.partOfSpeech,
      gloss: note.gloss
    };
    if (forms.length > 0) entry.forms = forms;
    if (note.grammar) entry.grammar = note.grammar;
    dictionary[key] = entry;
  }

  const data = {
    schemaVersion: 1,
    id: head.id || '',
    version: version,
    title: head.title || '',
    language: language,
    glossLanguage: 'de',
    fluentLanguage: 'de',
    paragraphs: paragraphs,
    dictionary: dictionary
  };
  if (head.titleTranslation) data.titleTranslation = head.titleTranslation;
  if (head.level) data.level = head.level;
  if (head.topics && head.topics.length > 0) {
    data.topics = Array.isArray(head.topics) ? head.topics : [head.topics];
  }

  /* Zum Schluss durch dieselbe Prüfung, die auch der Import anwendet.
     Was hier durchfällt, würde beim Empfänger durchfallen. */
  if (missing.length === 0) {
    for (const problem of validatePackage(data, new Set(['package.json']))) say(problem);
  }

  return {
    data: data,
    problems: problems,
    missing: missing,
    about: about,
    stats: {
      paragraphs: paragraphs.length,
      sentences: sentenceNumber,
      units: unitCount,
      phrases: phraseCount,
      keys: usedKeys.size
    }
  };
}

/* Grundform, Wortart, Formen, Glossen und ein Beispielsatz je Schlüssel. */
function note(map, key, lemma, partOfSpeech, surface, gloss, sentence) {
  let entry = map.get(key);
  if (!entry) {
    entry = { key: key, lemma: lemma, partOfSpeech: partOfSpeech, forms: [], glosses: [], sentence: sentence };
    map.set(key, entry);
  }
  if (entry.forms.indexOf(surface) < 0) entry.forms.push(surface);
  if (gloss && entry.glosses.indexOf(gloss) < 0) entry.glosses.push(gloss);
}

function remember(map, key, form) {
  if (!map.has(key)) map.set(key, []);
  const list = map.get(key);
  if (list.indexOf(form) < 0) list.push(form);
}

function shorten(text) {
  const clean = String(text);
  return clean.length > 40 ? clean.slice(0, 40) + '…' : clean;
}

module.exports = { parseWork, parseWordNote, splitNote, buildPackage };
