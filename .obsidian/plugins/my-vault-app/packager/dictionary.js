"use strict";

/*
 * Der Wortvorrat einer Sprache.
 *
 * Eine Datei je Sprache, ein Eintrag je Schlüssel, gültig über alle Texte
 * hinweg. Das ist die Ordnung, um die es beim ganzen Umbau geht: Ein Wort
 * wird einmal beschrieben, nicht einmal je Text. Siehe
 * konzept/umbau-ein-woerterbuch.md.
 *
 * Hier stehen nur Rechnungen - kein Obsidian, keine Dateien. Geprüft in
 * tests/packager-dictionary.test.js.
 */

const { keyFor } = require('../core/package.js');
const { parseWordNote } = require('./build.js');

/* Die Reihenfolge der Felder in einem Eintrag. Fest, damit dieselben
   Einträge immer dieselbe Datei ergeben - sonst sähe jeder Lauf nach
   Änderung aus. */
const FIELDS = ['lemma', 'partOfSpeech', 'gloss', 'forms', 'grammar', 'schema'];

/* Ein Eintrag, wie er ins Wörterbuch gehört. Was nicht dazugehört, fällt
   weg; leere Felder werden gar nicht erst geschrieben. */
function entry(source) {
  const clean = {
    lemma: String(source.lemma || ''),
    partOfSpeech: String(source.partOfSpeech || '').toUpperCase(),
    gloss: String(source.gloss || '')
  };

  const forms = Array.isArray(source.forms)
    ? source.forms.map((one) => String(one)).filter(Boolean)
    : [];
  if (forms.length > 0) clean.forms = forms;

  const grammar = String(source.grammar || '').trim();
  if (grammar) clean.grammar = grammar;

  clean.schema = Number.isFinite(source.schema) ? source.schema : 0;
  return clean;
}

/* Aus einer Wortnotiz der alten Werkstatt einen Eintrag machen.

   Der Schlüssel aus dem Kopf gilt - nicht der, der sich aus Grundform und
   Wortart ergäbe. Beide sollten gleich sein; wenn nicht, ist die Notiz
   unter dem Schlüssel entstanden, unter dem sie auch gefunden wird, und
   daran hängt der Lernstand. */
function fromNote(text, code) {
  const note = parseWordNote(text);
  if (!note.lemma || !note.partOfSpeech) return null;

  const key = note.key || keyFor(code, note.lemma, note.partOfSpeech);
  if (!key) return null;

  return { key: key, entry: entry(note) };
}

/* Was fehlt, kommt dazu. Was schon da ist, bleibt, wie es ist.

   Das ist die Regel für die Werkstatt: Ein neuer Text lässt nur
   nachschlagen, was der Wortvorrat noch nicht kennt. Sonst bekäme
   dasselbe Wort bei jedem Text eine neue Beschreibung - und genau das
   soll ein Wörterbuch verhindern.

   Besser werden Einträge nicht hierdurch, sondern durch ausdrückliches
   Auffrischen. */
function addMissing(into, offered) {
  const added = [];
  for (const key of Object.keys(offered)) {
    if (Object.prototype.hasOwnProperty.call(into, key)) continue;
    into[key] = entry(offered[key]);
    added.push(key);
  }
  return added;
}

/* Welche Schlüssel dem Wortvorrat noch fehlen. */
function missingFrom(dictionary, keys) {
  const missing = [];
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(dictionary, key)) missing.push(key);
  }
  return missing;
}

/* Der Auszug, der mit einem Text mitreist: nur die Schlüssel, die darin
   vorkommen. */
function extract(dictionary, keys) {
  const result = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(dictionary, key)) {
      result[key] = dictionary[key];
    }
  }
  return result;
}

/* Lesen, ohne sich an einer kaputten Datei zu verschlucken: Was sich
   nicht als Eintrag lesen lässt, wird gemeldet statt stillschweigend
   übernommen. */
function parse(text) {
  const problems = [];
  let raw;
  try {
    raw = JSON.parse(String(text || '{}'));
  } catch (error) {
    return { dictionary: {}, problems: ['The dictionary is not valid JSON: ' + String(error.message || error)] };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { dictionary: {}, problems: ['The dictionary should be an object of key to entry.'] };
  }

  const dictionary = {};
  for (const key of Object.keys(raw)) {
    const one = raw[key];
    if (!one || typeof one !== 'object') {
      problems.push('"' + key + '" is not an entry.');
      continue;
    }
    if (!one.lemma || !one.partOfSpeech) {
      problems.push('"' + key + '" has no lemma or part of speech.');
      continue;
    }
    dictionary[key] = entry(one);
  }
  return { dictionary: dictionary, problems: problems };
}

/* Schreiben: nach Schlüssel sortiert, feste Feldreihenfolge, abschließender
   Zeilenumbruch. Derselbe Inhalt ergibt immer dieselbe Datei. */
function serialize(dictionary) {
  const out = {};
  for (const key of Object.keys(dictionary).sort()) {
    const one = dictionary[key];
    const tidy = {};
    for (const field of FIELDS) {
      if (one[field] !== undefined) tidy[field] = one[field];
    }
    out[key] = tidy;
  }
  return JSON.stringify(out, null, 2) + '\n';
}

module.exports = { entry, fromNote, addMissing, missingFrom, extract, parse, serialize };
