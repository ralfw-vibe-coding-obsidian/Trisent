"use strict";

/* Die Tür: ein Paket erkennen, gleich welcher Fassung.

   Pakete der ersten Fassung liegen auf fremden Rechnern und müssen
   importierbar bleiben. Pakete der zweiten kommen ab jetzt aus der
   Werkstatt. Beide müssen hinter der Tür dasselbe ergeben - sonst gibt es
   wieder zwei Wege mit zwei Ergebnissen.

   Was gültig ist, prüft der Vertrag (core/package.js, eigene Tests dort).
   Hier geht es darum, dass die Tür die richtige Prüfung wählt und aus
   beiden Fassungen dasselbe macht. Als Beispiel dient ein echtes Paket:
   das Test-Archiv im Wurzelverzeichnis. */

const fs = require('fs');
const path = require('path');
const { test, testAsync, is, ok, load } = require('./run.js');
const l = load('learning/layout.js');
const zip = load('core/zip.js');
const contract = load('core/package.js');

const enc = (value) => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));

/* Das Test-Archiv, ausgepackt: Pfad -> Bytes. */
async function beispiel() {
  const bytes = fs.readFileSync(path.join(__dirname, '..', 'Import-Test-OK.zip'));
  const files = await zip.readZip(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  return l.relativeTo(files, l.packageRoot(files.keys()));
}

/* Dasselbe Paket in der zweiten Fassung, wie die Werkstatt es schickt. */
function alsZweiteFassung(ersteFassung, wortbuch) {
  const data = JSON.parse(new TextDecoder().decode(ersteFassung.get('package.json')));
  const parts = contract.splitPackage(data);
  const out = new Map();
  out.set('package.json', enc(parts.head));
  out.set('text.json', enc(parts.text));
  out.set('dictionary.json', enc(wortbuch || parts.dictionary));
  for (const [name, bytes] of ersteFassung) if (name.startsWith('audio/')) out.set(name, bytes);
  return out;
}

/* ------------------------------------------------------------------ */
/* Wo im Archiv                                                       */
/* ------------------------------------------------------------------ */

test('das Paket liegt direkt im Archiv', () => {
  is(l.packageRoot(['package.json', 'text.json', 'audio/s1.mp3']), '', 'kein Präfix');
});

test('das Paket liegt in einem Ordner im Archiv', () => {
  is(l.packageRoot(['Café/package.json', 'Café/text.json']), 'Café/', 'der Ordner');
});

test('die am wenigsten tief liegende Paketdatei gewinnt', () => {
  is(l.packageRoot(['a/b/package.json', 'a/package.json']), 'a/', 'die obere');
});

test('ohne Paketdatei gibt es kein Paket', () => {
  is(l.packageRoot(['text.json', 'audio/s1.mp3']), null, 'nichts');
  is(l.packageRoot(['mein-package.json']), null, 'ein ähnlicher Name ist keiner');
});

test('die Pfade werden relativ zum Paketordner', () => {
  const rel = l.relativeTo(new Map([['Café/package.json', 1], ['Café/audio/s1.mp3', 2], ['anderes.txt', 3]]), 'Café/');
  is([...rel.keys()], ['package.json', 'audio/s1.mp3'], 'nur das Paket, ohne Präfix');
});

/* ------------------------------------------------------------------ */
/* Beide Fassungen ergeben dasselbe                                   */
/* ------------------------------------------------------------------ */

testAsync('die erste Fassung wird erkannt und geprüft', async ({ is, ok }) => {
  const p = l.readPackage(await beispiel());
  is(p.problems, [], 'keine Beanstandung');
  is(p.version, 1, 'erste Fassung');
  ok(p.paragraphs.length > 0, 'mit Text');
  ok(Object.keys(p.dictionary).length > 0, 'mit Wörterbuch');
  ok(!('paragraphs' in p.head) && !('dictionary' in p.head), 'der Kopf ist nur Kopf');
});

testAsync('die zweite Fassung wird aus drei Dateien gelesen', async ({ is }) => {
  const p = l.readPackage(alsZweiteFassung(await beispiel()));
  is(p.problems, [], 'keine Beanstandung');
  is(p.version, 2, 'zweite Fassung');
});

testAsync('beide Fassungen ergeben denselben Kopf, Text und dasselbe Wörterbuch', async ({ is }) => {
  const erste = await beispiel();
  const a = l.readPackage(erste);
  const b = l.readPackage(alsZweiteFassung(erste));
  is(a.head, b.head, 'Kopf');
  is(a.paragraphs, b.paragraphs, 'Text');
  is(a.dictionary, b.dictionary, 'Wörterbuch');
});

testAsync('abgelegt wird immer in der zweiten Fassung', async ({ is }) => {
  const erste = await beispiel();
  is(l.readPackage(erste).head.schemaVersion, 2, 'aus der ersten');
  is(l.readPackage(alsZweiteFassung(erste)).head.schemaVersion, 2, 'aus der zweiten');
});

/* ------------------------------------------------------------------ */
/* Was nicht geht, sagt es deutlich                                   */
/* ------------------------------------------------------------------ */

test('ohne Paketdatei: eine klare Meldung', () => {
  const p = l.readPackage(new Map());
  ok(p.problems[0].indexOf('no package.json') >= 0, 'sagt, was fehlt');
});

test('kaputtes JSON: die Meldung nennt die Datei', () => {
  const p = l.readPackage(new Map([['package.json', enc('{ nicht json')]]));
  ok(p.problems[0].indexOf('package.json is not valid JSON') >= 0, 'welche Datei');
});

test('eine Liste statt eines Pakets wird abgewiesen', () => {
  const p = l.readPackage(new Map([['package.json', enc('[1,2]')]]));
  ok(p.problems[0].indexOf('does not describe a package') >= 0, 'abgewiesen');
});

testAsync('zweite Fassung ohne Text: der Vertrag beanstandet es', async ({ ok }) => {
  const zweite = alsZweiteFassung(await beispiel());
  zweite.delete('text.json');
  const p = l.readPackage(zweite);
  ok(p.problems.length > 0, 'beanstandet');
  ok(p.head === undefined, 'und nichts, womit man weiterarbeiten könnte');
});

testAsync('eine absurd hohe Nummer am Eintrag wird abgewiesen', async ({ ok }) => {
  /* Sie würde die Erklärung eines Wortes für immer einfrieren. Die
     Prüfung dafür steht im Vertrag - hier wird nur gesichert, dass die
     Tür sie auch anwendet. */
  const erste = await beispiel();
  const data = JSON.parse(new TextDecoder().decode(erste.get('package.json')));
  const wortbuch = contract.splitPackage(data).dictionary;
  const key = Object.keys(wortbuch)[0];
  wortbuch[key] = Object.assign({}, wortbuch[key], { entrySchema: 999999 });

  const p = l.readPackage(alsZweiteFassung(erste, wortbuch));
  ok(p.problems.some((line) => line.indexOf(key) >= 0), 'die Beanstandung nennt das Wort');
});

testAsync('eine vernünftige Nummer geht durch', async ({ is }) => {
  const erste = await beispiel();
  const data = JSON.parse(new TextDecoder().decode(erste.get('package.json')));
  const wortbuch = contract.splitPackage(data).dictionary;
  for (const key of Object.keys(wortbuch)) wortbuch[key] = Object.assign({}, wortbuch[key], { entrySchema: 3 });

  is(l.readPackage(alsZweiteFassung(erste, wortbuch)).problems, [], 'keine Beanstandung');
});

/* ------------------------------------------------------------------ */
/* Ist der Text schon bekannt?                                        */
/* ------------------------------------------------------------------ */

test('ein unbekannter Text ist neu', () => {
  is(l.compareVersion(null, 3), 'new', 'nicht da');
  is(l.compareVersion(undefined, 3), 'new', 'auch nicht da');
});

test('eine höhere Fassung ist ein Update', () => {
  is(l.compareVersion(4, 5), 'newer', 'höher');
});

test('dieselbe Fassung ist nichts Neues', () => {
  is(l.compareVersion(5, 5), 'same', 'gleich');
});

test('eine niedrigere Fassung ist ein Rückschritt', () => {
  is(l.compareVersion(6, 5), 'older', 'niedriger');
});

test('ohne Nummer zählt die Fassung als null', () => {
  is(l.compareVersion(0, undefined), 'same', 'beide ohne');
  is(l.compareVersion(2, undefined), 'older', 'die fehlende ist älter');
  is(l.compareVersion(0, 1), 'newer', 'jede Nummer schlägt keine');
});
