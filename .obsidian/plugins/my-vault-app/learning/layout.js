"use strict";

/*
 * Ein Paket aus einem Archiv holen - in beiden Fassungen.
 *
 * Erste Fassung: alles in package.json - Kopf, Text, Wörterbuch.
 * Zweite Fassung: package.json ist nur der Kopf, daneben text.json und
 * dictionary.json.
 *
 * WAS eine gültige Fassung ist, steht nicht hier, sondern im Vertrag:
 * core/package.js (validatePackage, validateParts, splitPackage). Hier
 * wird nur entschieden, welche der beiden Prüfungen dran ist, und das
 * Ergebnis in eine Form gebracht, hinter der niemand mehr wissen muss,
 * welche Fassung hereinkam. Eine eigene Beschreibung des Formats neben
 * der im Vertrag würde mit der Zeit von ihr abweichen - und dann nähme
 * die Tür etwas an, das der Packager nie so gebaut hätte, oder umgekehrt.
 *
 * Ohne Obsidian, damit es geprüft werden kann - siehe
 * tests/learning-layout.test.js.
 */

const {
  PACKAGE_FILE, validatePackage, validateParts, splitPackage
} = require('../core/package.js');

/* Wo im Archiv das Paket liegt. Die Paketdatei kann direkt im Archiv
   liegen oder in einem Ordner darin; die am wenigsten tief liegende
   gewinnt. Liefert das Präfix bis dorthin - oder null. */
function packageRoot(names) {
  let best = null;
  for (const name of names || []) {
    const isPackage = name === PACKAGE_FILE || name.endsWith('/' + PACKAGE_FILE);
    if (!isPackage) continue;
    if (best === null || name.split('/').length < best.split('/').length) best = name;
  }
  return best === null ? null : best.slice(0, best.length - PACKAGE_FILE.length);
}

/* Alles unterhalb des Paketordners, mit Pfaden relativ zu ihm. */
function relativeTo(files, prefix) {
  const out = new Map();
  for (const [name, value] of files || []) {
    if (!name.startsWith(prefix)) continue;
    const rest = name.slice(prefix.length);
    if (rest) out.set(rest, value);
  }
  return out;
}

function asText(raw) {
  return typeof raw === 'string' ? raw : new TextDecoder('utf-8').decode(raw);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/* Ein ausgepacktes Paket lesen und prüfen.

   contents: Pfad (relativ zum Paket) -> Inhalt, als Text oder Bytes.

   Liefert { problems } - oder, wenn es keine gibt:
   - version:    welche Fassung hereinkam (1 oder 2)
   - head:       der Kopf, wie er abgelegt wird - zweite Fassung
   - paragraphs: der Text
   - dictionary: das mitgebrachte Wörterbuch, roh

   Woran die Fassung zu erkennen ist: Steht der Text im Kopf, ist es die
   erste. Das ist dieselbe Frage, die der Vertrag stellt, bevor er die
   eine oder die andere Prüfung anwendet. */
function readPackage(contents) {
  const raw = contents.get(PACKAGE_FILE);
  if (raw == null) return { problems: ['There is no ' + PACKAGE_FILE + ' in this package.'] };

  let data;
  try {
    data = JSON.parse(asText(raw).replace(/^﻿/, ''));
  } catch (error) {
    return { problems: [PACKAGE_FILE + ' is not valid JSON: ' + String(error.message || error)] };
  }
  if (!isObject(data)) return { problems: [PACKAGE_FILE + ' does not describe a package.'] };

  let version;
  let whole;

  if (Array.isArray(data.paragraphs)) {
    version = 1;
    const problems = validatePackage(data, new Set(contents.keys()));
    if (problems.length > 0) return { problems: problems };
    whole = data;
  } else {
    version = 2;
    const checked = validateParts(contents);
    if (checked.problems.length > 0) return { problems: checked.problems };
    whole = checked.data;
  }

  const parts = splitPackage(whole);
  return {
    problems: [],
    version: version,
    head: parts.head,
    paragraphs: parts.text.paragraphs,
    dictionary: parts.dictionary
  };
}

/* Ist dieser Text schon bekannt - und wenn ja, in welcher Fassung?

   have:     die Fassung in der Bibliothek, oder null, wenn er nicht da ist
   incoming: die Fassung, die in der Inbox liegt

   - 'new':   noch nicht da - ablegen.
   - 'newer': da, in älterer Fassung - ersetzen, das ist ein Update.
   - 'same':  da, in dieser Fassung - nichts abzulegen.
   - 'older': da, in NEUERER Fassung - nicht übernehmen. Ein Rückschritt
              geschieht nicht aus Versehen beim Aufräumen der Inbox.

   Fehlt eine Nummer, zählt sie als 0. Ein Paket ohne Fassung ist damit
   älter als jedes mit einer - die ungefährliche Richtung. */
function compareVersion(have, incoming) {
  if (have === null || have === undefined) return 'new';
  const a = Number.isFinite(Number(have)) ? Number(have) : 0;
  const b = Number.isFinite(Number(incoming)) ? Number(incoming) : 0;
  if (b > a) return 'newer';
  if (b === a) return 'same';
  return 'older';
}

module.exports = { packageRoot, relativeTo, readPackage, compareVersion };
