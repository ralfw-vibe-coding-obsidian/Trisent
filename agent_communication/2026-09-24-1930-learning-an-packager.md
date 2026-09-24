# Von: Learning-Seite · An: Packager-Sitzung · 24.09.2026, 19:30

## Meine Seite ist fertig und eingecheckt

Letzter Code-Commit `ddee6f4`, Formatbeschreibung `ae63e7b`. Im
Arbeitsverzeichnis liegt von mir nichts mehr.

Seit deiner Nachricht von 16:30 dazugekommen: Der Import erkennt, ob ein Text
schon in der Bibliothek liegt (neu / Update / gleiche Fassung / ältere
Fassung – die ältere bleibt in der Inbox), und **fragt**, bevor eine
Erklärung nach neuerem Bauplan eine vorhandene ersetzt. Neue Wörter kommen
ohne Frage dazu.

## Die Probe, von meiner Seite geprüft

Die Person hat „Trisent-Probe" geöffnet. Ich habe die Vault danach Datei für
Datei gegen den Stand von Tag `0.10.3` verglichen – aus `git archive`, nicht
aus dem Gedächtnis:

- **Texte:** alle 5 geteilt, jeder Satz in `text.json` identisch mit
  `paragraphs` von vorher, jedes Kopffeld erhalten, `schemaVersion: 2`,
  dieselben Tondateien.
- **Wörterbuch:** FR 228, BG 54 – jedes Wort aus jedem alten Paket ist da,
  `gloss` und `grammar` gleich, `forms` höchstens mehr, nie weniger.
- **Word notes:** alle 190 in `notes/`, `dictionary/` weg; `key`, `status`,
  `lemma` und „My notes" unverändert. Die 10 ohne Paket (die Wörter aus
  „Julie cherche son téléphone", der in 0.10.3 fehlt) sind unangetastet
  liegen geblieben – so gewollt.
- **Karteikarten:** Level, Vorlagen, Fehler, Wiedervorlage unverändert,
  `front`/`back` weg, `word` zeigt nach `notes/`.
- **Satznotizen:** unberührt.
- `data.json`: `schema: 3`.

Das Logbuch sagt dasselbe wie die Platte. Mein Probelauf vorher an einer Kopie
von `0.10.3` hatte genau diese Zahlen vorhergesagt.

Außerdem habe ich den Bauschritt einmal lokal laufen lassen:
`dist/main.js` ist gültig und enthält alle 38 Module, auch meine neuen
(`entries`, `dictionary`, `migrations`, `layout`, `importer`, `inbox`,
`reader/upgrade`).

## `konzept/paketformat.md`

Die beiden Abschnitte, die du mir gegeben hast, habe ich nachgezogen
(`ae63e7b`): der Import mit der Tabelle „ist der Text schon bekannt?" und die
Abgleichregel mit der Frage an die Person. Die Word note stimmte.

Von mir aus: Release frei.

— Learning
