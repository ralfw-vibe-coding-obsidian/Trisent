"use strict";

/*
 * Der Umbau alter Notizen auf das heutige Schema - der Teil, der Text
 * umschreibt.
 *
 * Kennt weder Obsidian noch Dateien. Das ist hier besonders wichtig:
 * Eine Migration läuft genau einmal, über alle Notizen der Person, und
 * niemand sieht zu. Schneidet sie einen Satz zu viel weg, ist er weg.
 * Deshalb steht die Schere hier und wird in tests/learning-schema.test.js
 * geprüft, während das Öffnen und Schreiben der Dateien woanders liegt.
 *
 * Grundsatz bei allem hier: Was die Person selbst geschrieben hat, bleibt.
 * Im Zweifel wird etwas aufgehoben, nicht weggeworfen.
 */

/* Zum Vergleichen: Zeilenumbrüche und doppelte Leerzeichen sind kein
   Unterschied. Ein Text, der nur anders umbrochen ist, ist derselbe. */
function sameText(a, b) {
  const flat = (text) => String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  return flat(a) === flat(b);
}

/* Einen Abschnitt "## Titel" aus einem Notiztext herausnehmen. Liefert
   den Inhalt des Abschnitts und den Text ohne ihn. */
function takeSection(body, title) {
  const lines = String(body == null ? '' : body).split('\n');
  const start = lines.findIndex((line) => line.trim() === '## ' + title);
  if (start < 0) return { content: '', rest: String(body == null ? '' : body) };

  let end = start + 1;
  while (end < lines.length && !/^##\s/.test(lines[end])) end++;

  const content = lines.slice(start + 1, end).join('\n').trim();
  const rest = lines.slice(0, start).concat(lines.slice(end)).join('\n');
  return { content: content, rest: rest };
}

/* Sicherstellen, dass es "## My notes" gibt - dort schreibt die Person
   hin, und der Cursor springt dorthin. */
function withMyNotes(body) {
  const text = String(body == null ? '' : body).replace(/^\n+/, '').trimEnd();
  if (/^##\s+My notes\s*$/m.test(text)) return text + '\n';
  return (text ? text + '\n\n' : '') + '## My notes\n';
}

/* Eine Word note auf das heutige Schema bringen: Die Grammatik gehört
   dem Paket und fliegt raus.

   ABER: Hat die Person daran etwas geändert, ist es ihr Text. Der wird
   dann unter "My notes" gerettet, statt gelöscht zu werden. Ein Satz,
   den jemand selbst geschrieben hat, ist mehr wert als ein sauberes
   Schema. */
function cleanWordNote(body, entryGrammar) {
  const taken = takeSection(body, 'Grammar');
  const rescue = taken.content && !sameText(taken.content, entryGrammar);

  let rest = withMyNotes(taken.rest);
  if (rescue) rest = rest.trimEnd() + '\n\n' + taken.content + '\n';

  return {
    body: rest,
    removed: Boolean(taken.content),
    rescued: Boolean(rescue)
  };
}

/* Eine Flashcard auf das heutige Schema bringen: Der nackte Wikilink im
   Text war ein Fehlgriff - er zeigte auf die Karte selbst, weil beide
   Notizen gleich heißen. Er kommt raus; wohin er zeigen wollte, wird
   zurückgegeben, damit der Aufrufer den richtigen Verweis setzen kann. */
function cleanFlashcard(body) {
  const lines = String(body == null ? '' : body).split('\n');
  const at = lines.findIndex((line) => /^\[\[[^\]]+\]\]$/.test(line.trim()));

  let target = null;
  if (at >= 0) {
    target = lines[at].trim().slice(2, -2).split('|')[0];
    lines.splice(at, 1);
  }

  return { body: withMyNotes(lines.join('\n')), target: target };
}

module.exports = { sameText, takeSection, withMyNotes, cleanWordNote, cleanFlashcard };
