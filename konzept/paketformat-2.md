# Paketformat, zweite Fassung

Entwurf. Er löst `paketformat.md` ab, sobald beide Seiten einverstanden sind –
bis dahin gilt dort die erste Fassung weiter.

Was hier **nicht** steht, ändert sich nicht: Absätze, Sätze, Einheiten,
Wendungen, Zeichenoffsets, Schlüsselbildung (`keyFor`), die vierzehn Wortarten,
die Prüfregeln 1 bis 10. Das alles bleibt, wie es in `paketformat.md` steht.

## Was sich ändert

Ein Paket ist künftig **ein ZIP**, und sein Inhalt ist in drei Dateien geteilt:
Kopf, Text, Wörterbuch. Der Grund ist das Wörterbuch: Beim Import wird es in
ein **zentrales Wörterbuch je Sprache** eingearbeitet und verschwindet danach.
Damit gibt es für ein Wort genau eine Erklärung – nicht eine je Text.

Warum das nötig ist, steht in `umbau-ein-woerterbuch.md`.

## Das Archiv

```text
package.zip
├── package.json      Kopf
├── text.json         der Text
├── dictionary.json   die Einträge zu allen vorkommenden Schlüsseln
└── audio/            eine Datei je Satz, optional
```

Der Name des Archivs ist frei; in der Werkstatt heißt es `package.zip`, eine
Kopie zum Weitergeben darf heißen, wie sie will. Was zählt, ist der Inhalt.

## package.json

Derselbe Kopf wie bisher, **ohne** `paragraphs` und **ohne** `dictionary`:

```json
{
  "schemaVersion": 2,
  "id": "bg-boy-and-dog",
  "version": 1,
  "title": "Момчето и кучето",
  "titleTranslation": "Der Junge und der Hund",
  "language": "bg",
  "glossLanguage": "de",
  "fluentLanguage": "de",
  "level": "A1",
  "topics": ["animals", "friendship", "family"]
}
```

`schemaVersion: 2` sagt: Text und Wörterbuch liegen daneben. Bei `1` liegt
alles in dieser einen Datei, wie bisher.

## text.json

```json
{ "paragraphs": [] }
```

Inhalt unverändert – Absätze, Sätze, Einheiten, Wendungen, `audio` je Satz.
Wörtlich das, was bisher unter `paragraphs` in der Paketdatei stand.

## dictionary.json

```json
{
  "bg:куче:NOUN": {
    "lemma": "куче",
    "partOfSpeech": "NOUN",
    "gloss": "Hund",
    "forms": ["куче", "кучето", "кучета"],
    "grammar": "Neutrum. Bestimmte Form: кучето. Plural: кучета.",
    "entrySchema": 3
  }
}
```

Neu ist allein **`entrySchema`**: die Nummer des Bauplans, nach dem diese
Beschreibung geschrieben wurde. Sie steht am einzelnen Eintrag, nicht am
Paket – ein frisch gebautes Paket enthält zwangsläufig Einträge aus mehreren
Zeitaltern, weil die Werkstatt nur nachschlägt, was ihr fehlt.

**`entrySchema` ist nicht `schemaVersion`.** Das eine ist die Fassung des
Bauplans für Beschreibungen, das andere die Fassung des Paketformats. Sie
heißen deshalb verschieden.

Fehlt `entrySchema`, gilt `0`. Geprüft wird: ganze Zahl von 0 bis 1000
(`MAX_ENTRY_SCHEMA` in `core/package.js`). Eine absurd hohe Nummer würde das
Wörterbuch der Person an dieser Stelle für immer einfrieren – beim Import
gewinnt ja die höhere –, und niemand sähe, warum die Erklärung nicht mehr
besser wird.

## Die Prüfung

`core/package.js` bleibt die eine Prüfung für beide Seiten.

- `validateParts(files)` prüft ein ausgepacktes Paket der zweiten Fassung –
  `files` ist eine Map von Pfad auf Inhalt. Es liest die drei Dateien, setzt
  sie mit `joinPackage` zusammen und schickt das Ganze durch
  `validatePackage`. Ergebnis: `{ data, problems }`.
- `validatePackage(data, files)` prüft wie bisher, und die erste Fassung
  genau wie bisher. Die zweite nimmt sie in zusammengesetzter Form.
- `splitPackage(data)` teilt ein Paket in `{ head, text, dictionary }`.

## Der Import

1. Auspacken.
2. Prüfen – dieselben Regeln wie bisher, nur über drei Dateien verteilt.
3. Das Paket an seiner `id` wiedererkennen; sonst einen neuen Ordner anlegen.
4. `dictionary.json` in das zentrale Wörterbuch der Sprache einarbeiten.
5. `package.json`, `text.json` und `audio/` in den Paketordner schreiben.
   **`dictionary.json` wird nicht abgelegt**, und das Archiv auch nicht.

### Die Abgleichregel

Für jeden Schlüssel aus dem Paket:

- Steht er noch nicht im zentralen Wörterbuch: **aufnehmen**.
- Steht er schon dort: **ersetzen, wenn `entrySchema` höher ist**, sonst
  liegen lassen.

Mehr nicht. Kein Zusammenführen einzelner Felder, keine Rückfrage. Im
zentralen Wörterbuch steht nichts, was die Person geschrieben hat – es ist
jederzeit aus den Paketen neu aufbaubar.

Einträge, deren Paket später gelöscht wird, bleiben stehen. Es ist ihr
Wörterbuch, nicht das des Textes.

## Alte Pakete

Pakete der ersten Fassung liegen auf fremden Rechnern und müssen weiter
importierbar sein. Erkennungsmerkmal ist `schemaVersion`. Bei `1` werden
`paragraphs` und `dictionary` aus der Paketdatei gelesen und wie oben
behandelt; die Einträge zählen als `entrySchema: 0` und werden deshalb von jedem
neueren Paket abgelöst.

## Was gelesen wird

**Die Worterklärung kommt ab jetzt ausschließlich aus dem zentralen
Wörterbuch** – in der Wortkarte, gleich ob aus dem Text oder aus der Notiz
heraus geöffnet, und auf der Karteikarte. Das Wörterbuch im Paket ist
Transportmittel, kein Lager.
