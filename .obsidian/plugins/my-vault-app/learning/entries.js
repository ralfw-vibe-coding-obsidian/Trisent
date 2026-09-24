"use strict";

/*
 * Word entries: was über ein Wort bekannt ist - Grundform, Wortart,
 * Bedeutung, Formen, Beschreibung.
 *
 * Hier steht, wie ein Eintrag aussieht und was beim Abgleich zweier
 * Fassungen gewinnt. Ohne Obsidian, ohne Dateien, damit es geprüft
 * werden kann - siehe tests/learning-entries.test.js.
 *
 * Das ist die heikelste Rechnung der ganzen App: Sie entscheidet, ob
 * eine gute Erklärung stehen bleibt oder von einer schlechteren
 * überschrieben wird. Ein Fehler hier fällt nie auf. Die Person sieht
 * nur, dass ein Wort seit einiger Zeit dürftig erklärt ist, und hält es
 * für den Stand der Dinge.
 */

/* Die Fassung des Bauplans, nach dem eine Beschreibung geschrieben
   wurde. Sie steht am einzelnen Eintrag, nicht am Paket: Ein frisch
   gebautes Paket enthält Einträge aus mehreren Zeitaltern, weil die
   Werkstatt nur nachschlägt, was ihr fehlt.

   Sie heißt `entrySchema` und NICHT `schema` - `schemaVersion` am Paket
   ist etwas anderes, und die Nummer in data.json noch einmal. Drei
   Zahlen, drei Namen. */
const ENTRY_SCHEMA = 'entrySchema';

function text(value) {
  return typeof value === 'string' ? value : '';
}

/* Eine Nummer, auf die man sich verlassen kann: ganze Zahl, nicht
   negativ. Alles andere zählt als 0 - dann gilt der Eintrag als aus der
   Vorzeit und wird vom nächsten besseren abgelöst. Das ist die
   ungefährliche Richtung: Unsinn friert nichts ein. */
function schemaOf(entry) {
  const raw = entry ? entry[ENTRY_SCHEMA] : 0;
  const value = Math.trunc(Number(raw));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/* Aus dem, was im Paket steht, einen Eintrag machen, auf den sich die
   App verlassen kann. Fehlendes fehlt - es wird nichts erfunden. */
function normalizeEntry(raw, key) {
  if (!raw || typeof raw !== 'object') return null;

  const parts = String(key == null ? '' : key).split(':');
  const entry = {
    lemma: text(raw.lemma) || parts[1] || '',
    partOfSpeech: text(raw.partOfSpeech) || parts[2] || '',
    gloss: text(raw.gloss),
    grammar: text(raw.grammar),
    forms: Array.isArray(raw.forms) ? raw.forms.filter((form) => text(form)) : []
  };
  entry[ENTRY_SCHEMA] = schemaOf(raw);
  return entry;
}

/* Alles, was ein Paket mitbringt, auf einmal - Schlüssel bleibt
   Schlüssel, nur der Inhalt wird in Form gebracht. */
function normalizeAll(dictionary) {
  const out = new Map();
  if (!dictionary || typeof dictionary !== 'object') return out;

  for (const [key, raw] of Object.entries(dictionary)) {
    const entry = normalizeEntry(raw, key);
    if (entry) out.set(key, entry);
  }
  return out;
}

/* Die Abgleichregel, und sie ist absichtlich kurz:

   - Schlüssel noch nicht da: aufnehmen.
   - Schon da: ersetzen, wenn die Nummer HÖHER ist. Sonst liegen lassen.

   Kein Zusammenführen einzelner Felder. Ein Eintrag ist ein Ganzes -
   Bedeutung, Formen und Beschreibung gehören zusammen, und eine aus
   zwei Fassungen zusammengesetzte Erklärung hätte niemand je geprüft.

   Bei gleicher Nummer gewinnt das Vorhandene. Das ist die stille
   Entscheidung dahinter: Zwei Fassungen desselben Bauplans sind
   gleichwertig, und wer dann doch tauscht, schreibt bei jedem Import
   die Datei um, ohne dass sich etwas verbessert.

   Der Bestand wird nicht verändert; es kommt eine neue Sammlung heraus. */
function mergeEntries(current, incoming) {
  const entries = new Map(current || []);
  const report = { added: 0, replaced: 0, kept: 0 };

  for (const [key, entry] of incoming || []) {
    const have = entries.get(key);

    if (!have) {
      entries.set(key, entry);
      report.added += 1;
      continue;
    }

    if (schemaOf(entry) > schemaOf(have)) {
      entries.set(key, entry);
      report.replaced += 1;
      continue;
    }

    report.kept += 1;
  }

  return { entries: entries, report: report };
}

/* Was ein Import am Wörterbuch ändern WÜRDE - bevor er es tut.

   Die Abgleichregel oben entscheidet, was gewinnt. Aber ob eine
   vorhandene Erklärung ersetzt wird, soll die Person entscheiden: Sie
   hat die alte vielleicht längst verinnerlicht, und eine neue Fassung
   ist nicht in jedem Fall eine bessere für sie. Deshalb wird erst
   geplant, dann gefragt, dann angewendet.

   - added:    Wörter, die es noch nicht gibt. Die kommen immer dazu - ohne
               sie hätte der Text Lücken, und es gibt nichts zu ersetzen.
   - upgrades: Wörter, deren Erklärung nach einem neueren Bauplan
               geschrieben ist. Je Wort: vorher, nachher, beide Nummern.
   - kept:     Wörter, bei denen das Vorhandene ohnehin bleibt. */
function planMerge(current, incoming) {
  const plan = { added: [], upgrades: [], kept: 0 };
  for (const [key, entry] of incoming || []) {
    const have = (current && current.get(key)) || null;
    if (!have) {
      plan.added.push(key);
      continue;
    }
    if (schemaOf(entry) > schemaOf(have)) {
      plan.upgrades.push({
        key: key,
        from: schemaOf(have),
        to: schemaOf(entry),
        before: have,
        after: entry
      });
      continue;
    }
    plan.kept += 1;
  }
  return plan;
}

/* Den Plan anwenden. `takeUpgrades` ist die Antwort der Person: ja, die
   neueren Erklärungen übernehmen - oder nein, nur die neuen Wörter.
   Der Bestand wird nicht verändert; es kommt eine neue Sammlung heraus. */
function applyMerge(current, incoming, takeUpgrades) {
  const entries = new Map(current || []);
  const report = { added: 0, replaced: 0, declined: 0 };

  for (const [key, entry] of incoming || []) {
    const have = entries.get(key);
    if (!have) {
      entries.set(key, entry);
      report.added += 1;
    } else if (schemaOf(entry) > schemaOf(have)) {
      if (takeUpgrades) {
        entries.set(key, entry);
        report.replaced += 1;
      } else {
        report.declined += 1;
      }
    }
  }
  return { entries: entries, report: report };
}

/* Der Sonderfall beim Umbau alter Pakete - und NUR dort.

   Pakete der ersten Fassung listen unter `forms` die Formen, die in
   IHREM Text vorkommen. Dasselbe Wort hat in zwei Texten deshalb zwei
   verschiedene Listen, obwohl Bedeutung und Beschreibung Wort für Wort
   gleich sind (nachgezählt: 28 von 65 mehrfachen Wörtern, alle nur in
   den Formen). Nach der Regel oben gewönne die erste Liste, und die
   Formen aus den anderen Texten gingen verloren.

   Hier werden sie deshalb vereinigt: Der erste Eintrag bleibt, wie er
   ist, und bekommt die Formen der anderen dazu, die ihm fehlen. Das ist
   verlustfrei. Für neue Pakete gilt es nicht - die Werkstatt hat einen
   Wortvorrat je Sprache und schickt vollständige Formen mit, und dort
   bleibt es bei "ein Eintrag als Ganzes". */
function mergeLegacy(current, incoming) {
  const entries = new Map(current || []);

  for (const [key, entry] of incoming || []) {
    const have = entries.get(key);
    if (!have) {
      entries.set(key, entry);
      continue;
    }

    const forms = have.forms.slice();
    for (const form of entry.forms || []) {
      if (!forms.includes(form)) forms.push(form);
    }
    if (forms.length !== have.forms.length) {
      entries.set(key, Object.assign({}, have, { forms: forms }));
    }
  }

  return entries;
}

/* Zum Schreiben: eine Sammlung als schlichtes Objekt, nach Schlüssel
   sortiert. Die Sortierung ist kein Schmuck - so ergibt derselbe
   Bestand immer dieselbe Datei, und was sich in der Versionsgeschichte
   ändert, ist wirklich eine Änderung. */
function toObject(entries) {
  const out = {};
  for (const key of [...(entries || new Map()).keys()].sort()) {
    out[key] = entries.get(key);
  }
  return out;
}

module.exports = {
  ENTRY_SCHEMA, schemaOf, normalizeEntry, normalizeAll, mergeEntries, mergeLegacy,
  planMerge, applyMerge, toObject
};
