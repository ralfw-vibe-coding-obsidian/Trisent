"use strict";

/*
 * ZIP lesen - ohne Fremdbibliothek.
 *
 * Gemeinsamer Code. Der Reader braucht ihn zum Importieren, der Packager
 * später zum Ausliefern. Änderungen hier betreffen beide Seiten.
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

module.exports = { readZip };
