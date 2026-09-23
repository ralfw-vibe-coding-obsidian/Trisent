"use strict";

/*
 * ZIP lesen und schreiben - ohne Fremdbibliothek.
 *
 * Gemeinsamer Code. Der Reader braucht das Lesen zum Importieren, der
 * Packager das Schreiben zum Ausliefern. Änderungen hier betreffen beide
 * Seiten.
 */

/* Ein ZIP besteht aus den gepackten Dateien und einem Verzeichnis ganz
   am Ende. Wir lesen das Verzeichnis, weil nur dort verlässlich steht,
   was alles drin ist.

   Zum Entpacken nimmt der Browser seine eigene Maschinerie
   (DecompressionStream) - deshalb braucht es hier keine Bibliothek. */

function findEndOfCentralDirectory(view) {
  /* Das Schlussverzeichnis steht am Ende, kann aber einen Kommentar
     hinter sich haben - also rückwärts danach suchen. */
  const limit = Math.max(0, view.byteLength - 66000);
  for (let at = view.byteLength - 22; at >= limit; at--) {
    if (view.getUint32(at, true) === 0x06054b50) return at;
  }
  return -1;
}

async function inflate(bytes, method) {
  if (method === 0) return bytes; /* unkomprimiert abgelegt */
  if (method !== 8) throw new Error('Unsupported compression method ' + method + ' in the ZIP file.');

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

/* Liefert Pfad -> Inhalt für alle Dateien im Archiv. */
async function readZip(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);

  const end = findEndOfCentralDirectory(view);
  if (end < 0) throw new Error('This does not look like a ZIP file.');

  const count = view.getUint16(end + 10, true);
  const directoryAt = view.getUint32(end + 16, true);
  if (count === 0xffff || directoryAt === 0xffffffff) {
    throw new Error('ZIP64 archives are not supported. Please use a smaller archive.');
  }

  const decoder = new TextDecoder('utf-8');
  const files = new Map();
  let at = directoryAt;

  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) {
      throw new Error('The ZIP directory is damaged.');
    }

    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));

    at += 46 + nameLength + extraLength + commentLength;

    /* Ordnereinträge und die Beifänge von macOS überspringen. */
    if (name.endsWith('/')) continue;
    if (name.startsWith('__MACOSX/') || name.split('/').pop().startsWith('._')) continue;
    if (name.split('/').pop() === '.DS_Store') continue;

    if (view.getUint32(localAt, true) !== 0x04034b50) {
      throw new Error('The ZIP entry "' + name + '" is damaged.');
    }
    /* Die Längen im lokalen Kopf können von denen im Verzeichnis
       abweichen - hier gelten die lokalen. */
    const localNameLength = view.getUint16(localAt + 26, true);
    const localExtraLength = view.getUint16(localAt + 28, true);
    const dataAt = localAt + 30 + localNameLength + localExtraLength;

    files.set(name, await inflate(bytes.subarray(dataAt, dataAt + compressedSize), method));
  }

  return files;
}

/* ------------------------------------------------------------------ */
/* Schreiben                                                           */
/* ------------------------------------------------------------------ */

/* Die Prüfsumme, die in jedem Eintrag steht. Ohne sie hält kein
   Entpackprogramm das Archiv für gültig. */
let table = null;

function crcTable() {
  if (table) return table;
  table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
}

function crc32(bytes) {
  const lookup = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = lookup[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

/* Aus Pfad -> Inhalt ein Archiv machen. Inhalt darf Text oder Bytes sein.

   Zwei Entscheidungen, die man später nicht mehr sieht:

   Die Einträge stehen nach Pfad sortiert und tragen alle dasselbe feste
   Datum. Damit ergibt derselbe Inhalt immer dieselben Bytes - und die
   Frage "hat sich etwas geändert?" lässt sich am Archiv beantworten,
   statt seinen Inhalt zu vergleichen.

   Jede Datei kommt ins Archiv - die Frage ist nur, ob zusammengedrückt
   oder unverändert abgelegt. Tonspuren sind bereits komprimiert; sie
   durch den Packer zu schicken, macht sie nur größer. Sie liegen deshalb
   unverändert drin und kommen beim Auspacken heil wieder heraus. */
async function writeZip(files) {
  const encoder = new TextEncoder();
  const names = [...files.keys()].sort();

  if (names.length > 0xfffe) {
    throw new Error('Too many files for a ZIP archive without ZIP64.');
  }

  const locals = [];
  const directory = [];
  let at = 0;

  for (const name of names) {
    const value = files.get(name);
    const raw = typeof value === 'string' ? encoder.encode(value) : new Uint8Array(value);
    const title = encoder.encode(name);

    const packed = await deflate(raw);
    const stored = packed.length >= raw.length;
    const body = stored ? raw : packed;
    const method = stored ? 0 : 8;
    const sum = crc32(raw);

    if (raw.length > 0xfffffffe || body.length > 0xfffffffe) {
      throw new Error('"' + name + '" is too large for a ZIP archive without ZIP64.');
    }

    const local = new Uint8Array(30 + title.length + body.length);
    const head = new DataView(local.buffer);
    head.setUint32(0, 0x04034b50, true);
    head.setUint16(4, 20, true);       /* dafür reicht Fassung 2.0 */
    head.setUint16(6, 0x0800, true);   /* Namen sind UTF-8 */
    head.setUint16(8, method, true);
    head.setUint16(10, 0, true);       /* Uhrzeit: 00:00 */
    head.setUint16(12, 0x0021, true);  /* Datum: 1. Januar 1980 */
    head.setUint32(14, sum, true);
    head.setUint32(18, body.length, true);
    head.setUint32(22, raw.length, true);
    head.setUint16(26, title.length, true);
    head.setUint16(28, 0, true);
    local.set(title, 30);
    local.set(body, 30 + title.length);

    const entry = new Uint8Array(46 + title.length);
    const note = new DataView(entry.buffer);
    note.setUint32(0, 0x02014b50, true);
    note.setUint16(4, 20, true);
    note.setUint16(6, 20, true);
    note.setUint16(8, 0x0800, true);
    note.setUint16(10, method, true);
    note.setUint16(12, 0, true);
    note.setUint16(14, 0x0021, true);
    note.setUint32(16, sum, true);
    note.setUint32(20, body.length, true);
    note.setUint32(24, raw.length, true);
    note.setUint16(28, title.length, true);
    note.setUint32(42, at, true);
    entry.set(title, 46);

    locals.push(local);
    directory.push(entry);
    at += local.length;
  }

  const directorySize = directory.reduce((sum, one) => sum + one.length, 0);
  const end = new Uint8Array(22);
  const tail = new DataView(end.buffer);
  tail.setUint32(0, 0x06054b50, true);
  tail.setUint16(8, names.length, true);
  tail.setUint16(10, names.length, true);
  tail.setUint32(12, directorySize, true);
  tail.setUint32(16, at, true);

  const total = at + directorySize + end.length;
  const archive = new Uint8Array(total);
  let write = 0;
  for (const part of locals) { archive.set(part, write); write += part.length; }
  for (const part of directory) { archive.set(part, write); write += part.length; }
  archive.set(end, write);

  return archive;
}

module.exports = { readZip, writeZip };
