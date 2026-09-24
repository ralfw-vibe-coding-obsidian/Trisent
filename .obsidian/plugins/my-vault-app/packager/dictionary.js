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
const FIELDS = ['lemma', 'partOfSpeech', 'gloss', 'forms', 'grammar', 'entrySchema'];

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

  /* Nach welchem Bauplan diese Beschreibung geschrieben wurde. Heißt
     absichtlich nicht "schema": Im Kopf eines Pakets steht bereits
     "schemaVersion", und das ist etwas ganz anderes - die Fassung des
     Paketformats. */
  const written = Number(source.entrySchema);
  clean.entrySchema = Number.isFinite(written) && written >= 0 ? Math.floor(written) : 0;
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

/* Steht alles, was eine alte Wortnotiz wusste, im Wortvorrat? Derselbe
   Schlüssel, dieselbe Bedeutung, dieselbe Beschreibung, und jede ihrer
   Formen. Nur dann darf die Notiz weg.

   Eine Notiz, die sich gar nicht lesen ließ ("made" ist null), gilt
   ausdrücklich NICHT als enthalten - was man nicht lesen kann, kann man
   auch nicht übernommen haben. */
function covers(dictionary, made) {
  if (!made) return false;
  const target = dictionary[made.key];
  if (!target) return false;
  if (String(target.gloss || '') !== String(made.entry.gloss || '')) return false;
  if (String(target.grammar || '').trim() !== String(made.entry.grammar || '').trim()) return false;
  const known = Array.isArray(target.forms) ? target.forms : [];
  return (made.entry.forms || []).every((form) => known.indexOf(form) >= 0);
}

/* Formen, die ein Text mitgebracht hat, in den Wortvorrat übernehmen.

   Ein Eintrag soll alle Formen kennen, die je vorkamen - nicht nur die
   aus dem Text, in dem das Wort zum ersten Mal stand. Sonst trüge jedes
   Paket nur die Formen seines Textes, und im Wörterbuch der Person würde
   ein Eintrag mit jüngerer Beschreibung die Formen auf die eines einzigen
   Textes zurückschneiden.

   Nur Formen kommen dazu; Bedeutung und Beschreibung bleiben, wie sie
   sind. Liefert, wie viele Einträge sich geändert haben. */
function mergeForms(dictionary, entries) {
  let changed = 0;
  for (const key of Object.keys(entries || {})) {
    const target = dictionary[key];
    const offered = entries[key] && entries[key].forms;
    if (!target || !Array.isArray(offered)) continue;

    const forms = Array.isArray(target.forms) ? target.forms.slice() : [];
    let added = false;
    for (const form of offered) {
      if (form && forms.indexOf(form) < 0) {
        forms.push(String(form));
        added = true;
      }
    }
    if (added) {
      target.forms = forms;
      changed += 1;
    }
  }
  return changed;
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

module.exports = { entry, fromNote, covers, addMissing, mergeForms, missingFrom, extract, parse, serialize };
