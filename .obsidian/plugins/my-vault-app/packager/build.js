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

/* Der Dateiname hängt am Satz, nicht an seiner Nummer.

   Sonst wäre jede Änderung an der Werkbank gefährlich: Kommt ein Absatz
   dazu, verschieben sich alle Satznummern - und danach läge unter jedem
   Satz die Stimme des Nachbarn. Am Wortlaut festgemacht kann das nicht
   passieren. Ein geänderter Satz verliert seinen Ton und bekommt einen
   neuen; ein verschobener behält ihn. */
function nameFor(source) {
  let a = 0x811c9dc5;
  let b = 0x1000193;
  const text = String(source);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 16777619) >>> 0;
    b = Math.imul(b + code + i, 2654435761) >>> 0;
  }
  return 'audio/' + a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0') + '.mp3';
}

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
          lemma: parts[2] || citationOf(parts[0] || ''),
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

/* Die Zitierform einer Wendung: so, wie sie im Wörterbuch stünde, nicht
   so, wie sie zufällig im Satz steht. Am Satzanfang ist sie großgeschrieben
   und trägt womöglich einen typografischen Apostroph - beides gehört nicht
   in eine Grundform. */
function citationOf(surface) {
  const clean = String(surface).replace(/[\u2019\u2018\u02bc]/g, "'");
  return clean.charAt(0).toLowerCase() + clean.slice(1);
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

/*  audio     Map von Tondatei auf ihre Zeitmarken (oder null)
 *  into      Sprachcode der Person - in ihr stehen Glossen und Übersetzung
 *  work      Ergebnis von parseWork()
 *  original  Inhalt von text.md, oder null
 *  words     Map von Schlüssel auf Wortnotiz
 *  version   Nummer der neuen Fassung
 *
 *  Zurück kommt { data, problems, missing, stats }. Ist "problems" leer,
 *  ist "data" ein gültiges Paket.
 */
function buildPackage(work, original, words, version, audio, into) {
  const problems = [];
  const missing = [];
  const say = (text) => { if (problems.length < 40) problems.push(text); };

  const head = work.head || {};
  const language = String(head.language || '').toLowerCase();
  if (!language) say('The work note has no "language" in its front matter.');
  if (!head.id) say('The work note has no "id" in its front matter.');
  if (!head.title) say('The work note has no "title" in its front matter.');

  /* Dieselbe Wortform, dieselbe Wortart - aber zwei Grundformen, die
     sich nur in Akzenten, Groß- und Kleinschreibung oder Apostrophen
     unterscheiden. Das sind keine zwei Wörter, das ist ein Verschreiber,
     und er kostet den Lernstand. Weil die Absätze unabhängig voneinander
     bearbeitet werden, kann er entstehen; deshalb wird er hier gesucht. */
  const spellings = new Map();
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
        rememberSpelling(spellings, unit.surface, unit.partOfSpeech, unit.lemma);
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

      /* Überlappende Wendungen kommen vor - "un poco" und "un poco de"
         im selben Satz. Beide sind für sich richtig, zusammen sind sie
         unzulässig. Daran soll aber nicht der ganze Text scheitern:
         Die längere gewinnt, weil sie die festere Fügung ist, und die
         kürzere fällt weg. Die Wörter darunter behalten ohnehin ihre
         eigenen Zeilen. */
      const kept = [];
      for (const one of phrases.slice().sort((a, b) => (b.end - b.start) - (a.end - a.start))) {
        if (kept.some((other) => one.start < other.end && other.start < one.end)) {
          usedKeys.delete(one.key);
          phraseCount -= 1;
          continue;
        }
        kept.push(one);
      }
      kept.sort((a, b) => a.start - b.start);
      phrases.length = 0;
      for (const one of kept) phrases.push(one);

      const built = { id: id, source: source, fluent: sentence.fluent, units: units };
      if (phrases.length > 0) built.phrases = phrases;

      /* Ton gehört zum Satz, sobald die Datei da ist - erzeugt wird er
         eigens, nicht beim Bauen. */
      const track = nameFor(source);
      if (audio && audio.has(track)) {
        built.audio = { file: track };
        const marks = timingsFor(audio.get(track), units);
        if (marks) {
          built.audio.durationMs = marks.durationMs;
          if (marks.timings.length > 0) built.audio.timings = marks.timings;
        }
      }

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

  for (const entry of spellings.values()) {
    if (entry.lemmas.length < 2) continue;
    say(
      '"' + entry.surface + '" (' + entry.partOfSpeech + ') was given two spellings of the same base form: ' +
      entry.lemmas.map((piece) => '"' + piece + '"').join(' and ') +
      '. They become different keys, and the learning state falls apart between them.'
    );
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
    glossLanguage: into || 'de',
    fluentLanguage: into || 'de',
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
    const files = new Set(['package.json']);
    if (audio) for (const name of audio.keys()) files.add(name);
    for (const problem of validatePackage(data, files)) say(problem);
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

/* Zwei Grundformen gelten als dasselbe Wort, wenn sie sich nur in
   Schreibweise unterscheiden. Echte Gleichschreiber - französisch "suis"
   von être und von suivre - bleiben unbeanstandet: Da sind die
   Grundformen wirklich verschieden. */
function skeleton(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2019\u2018\u02bc\s-]/g, '');
}

function rememberSpelling(map, surface, partOfSpeech, lemma) {
  const id = skeleton(surface) + '|' + partOfSpeech + '|' + skeleton(lemma);
  let entry = map.get(id);
  if (!entry) {
    entry = { surface: surface, partOfSpeech: partOfSpeech, lemmas: [] };
    map.set(id, entry);
  }
  if (entry.lemmas.indexOf(lemma) < 0) entry.lemmas.push(lemma);
}

/* Aus den Zeitmarken je Zeichen die Zeitmarken je Wort machen.

   Der Sprachdienst sagt, wann jedes Zeichen des Satzes klingt; die
   Einheiten wissen, welche Zeichen zu ihnen gehören. Mehr braucht es
   nicht - und geraten wird nichts: Wo eine Marke fehlt oder unsinnig
   wäre, bleibt das Wort ohne. Eine Hervorhebung, die danebenliegt, ist
   schlimmer als keine. */
function timingsFor(timing, units) {
  if (!timing || !Array.isArray(timing.starts)) return null;

  const timings = [];
  let previousEnd = -1;

  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const from = timing.starts[unit.start];
    const to = timing.ends[unit.end - 1];

    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    if (to <= from) continue;
    if (from < previousEnd) continue;

    timings.push({ unit: i, startMs: from, endMs: to });
    previousEnd = to;
  }

  return { durationMs: timing.durationMs, timings: timings };
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

module.exports = { parseWork, parseWordNote, splitNote, buildPackage, nameFor };
