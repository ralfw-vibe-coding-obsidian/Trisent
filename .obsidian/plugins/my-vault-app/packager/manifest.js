"use strict";

/*
 * Das Manifest eines Pakets: woraus es gebaut wurde.
 *
 * Es liegt neben package.zip und hält für jede Datei, aus der das Paket
 * entstand, einen Fingerabdruck fest - den Ausgangstext, die Werkbank,
 * jede Tonspur, und die Erklärungen seiner Wörter aus dem Wortvorrat.
 * Dazu, ob diese Fassung schon in die Inbox gelegt wurde.
 *
 * Daraus liest die Werkstatt ab, was bei einem Text zu tun ist: Weicht
 * etwas vom Manifest ab, ist das Paket veraltet. Sie fragt dafür niemanden
 * und schaut nirgends sonst hin - nur auf ihre eigenen Dateien.
 *
 * Fingerabdrücke statt Uhrzeiten: Ein Datum ändert sich beim Klonen, beim
 * Synchronisieren, beim bloßen Speichern ohne Änderung. Ein Paket sähe
 * dann veraltet aus, obwohl nichts anders ist.
 *
 * Nur Rechnungen, kein Obsidian. Geprüft in tests/packager-manifest.test.js.
 */

/* Ein Fingerabdruck für Text. Zeichengenau - auch ein Leerzeichen mitten
   im Satz ist eine Änderung, denn an ihm hängen die Stellen der Wörter. */
function hashOf(text) {
  const clean = String(text || '');
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < clean.length; i++) {
    const c = clean.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619) >>> 0;
    b = Math.imul(b ^ c, 2246822519) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0') + ':' + clean.length;
}

/* Was sich seit dem Bau geändert hat: aufgenommen, verschwunden,
   verändert - je Datei. */
function compare(recorded, current) {
  const before = recorded || {};
  const now = current || {};
  const added = [];
  const removed = [];
  const changed = [];

  for (const name of Object.keys(now).sort()) {
    if (!Object.prototype.hasOwnProperty.call(before, name)) added.push(name);
    else if (before[name] !== now[name]) changed.push(name);
  }
  for (const name of Object.keys(before).sort()) {
    if (!Object.prototype.hasOwnProperty.call(now, name)) removed.push(name);
  }
  return { added: added, removed: removed, changed: changed };
}

function isEmpty(changes) {
  return changes.added.length + changes.removed.length + changes.changed.length === 0;
}

/* In einem Satz, was anders ist - für den Knopf und die Zustandszeile. */
function describe(changes) {
  const parts = [];
  const all = changes.added.concat(changes.removed, changes.changed);

  if (all.indexOf('text.md') >= 0) parts.push('the text');
  if (all.indexOf('work.md') >= 0) parts.push('the workbench');
  if (all.indexOf('dictionary.json') >= 0) parts.push('the word explanations');

  const sounds = all.filter((name) => name.indexOf('audio/') === 0).length;
  if (sounds === 1) parts.push('a recording');
  else if (sounds > 1) parts.push(sounds + ' recordings');

  if (parts.length === 0) return '';
  const list = parts.length === 1
    ? parts[0]
    : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
  return list.charAt(0).toUpperCase() + list.slice(1) + ' changed since the last package.';
}

/* Ein Manifest lesen, ohne sich an einem kaputten zu verschlucken: Was
   sich nicht lesen lässt, gilt als nicht da - dann wird eben neu gebaut. */
function parse(text) {
  try {
    const data = JSON.parse(String(text || ''));
    if (!data || typeof data !== 'object' || !data.inputs || typeof data.inputs !== 'object') return null;
    return data;
  } catch (error) {
    return null;
  }
}

function serialize(manifest) {
  return JSON.stringify(manifest, null, 2) + '\n';
}

module.exports = { hashOf, compare, isEmpty, describe, parse, serialize };
