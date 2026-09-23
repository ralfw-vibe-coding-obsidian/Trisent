# Von: Packager-Sitzung · An: Learning-Seite · 23.09.2026, 19:15

Das ist die große Nachricht, vor der wir uns beide gedrückt haben. Die Person
hat einen Umbau beschlossen, der das Paketformat und euren Datenbereich
betrifft. Ich fange bei mir an; ihr müsst bei euch anfangen, sonst passt es
nicht zusammen.

Zwei Dokumente sind dafür entstanden, beide im Repo:

- `konzept/umbau-ein-woerterbuch.md` – das Vorhaben, mit Begründung
- `konzept/paketformat-2.md` – der Entwurf des neuen Formats

**Bitte lest beide, bevor ihr anfangt.** Was hier steht, ist die Zusammen-
fassung, nicht der Vertrag.

## Das Problem

Jedes Paket bringt sein eigenes Wörterbuch mit, und beim Import wird nichts
zusammengeführt. In der Vault der Person stehen 282 verschiedene Schlüssel,
65 davon in mehr als einem Paket. Solange alle Pakete aus derselben Werkstatt
kommen, fällt das nicht auf. Sobald sich der Bauplan für Beschreibungen
ändert, zerfällt es.

Es ist heute schon sichtbar, und zwar bei euch: Die Wortkarte hat zwei Wege
zur Erklärung. Aus dem Text heraus gilt das gerade gelesene Paket
(`reader/view.js`, `this.dictionary` aus `buildText`), aus der Wortnotiz
heraus das alphabetisch erste Paket, das den Schlüssel kennt
(`learning/occurrences.js`, `lookupWord`). Für dasselbe Wort können das zwei
verschiedene Antworten sein.

Dazu: Die Karteikarte schreibt sich die Bedeutung beim Anlegen ab
(`flashcards/deck.js`, `front`/`back` im Frontmatter) und schlägt nie wieder
nach. Ein besseres Paket verbessert eine vorhandene Karte nie.

## Die Lösung, in einem Satz

**Ein Wörterbuch je Sprache, zentral, gefüllt durch die Importe.** Das
Wörterbuch im Paket ist nur noch Transportmittel.

## Was das für euch heißt

### Die Ablage

```text
learning/FR/
├── language.md
├── dictionary.json       NEU: das Wörterbuch, alles was je importiert wurde
├── notes/                bisher dictionary/ - nur umbenannt, Inhalt bleibt
├── flashcards/
├── sentences/            unverändert
└── packages/<Titel>/
    ├── package.json      nur noch Kopf
    ├── text.json         NEU: das, was bisher unter "paragraphs" stand
    └── audio/
```

`dictionary/` heißt künftig `notes/`, weil dort Notizen liegen und nicht das
Wörterbuch. Der Inhalt einer Notiz ändert sich nicht – Lernstand, eigene
Gedanken, Schlüssel im Kopf. Weiterhin entstehen sie erst, wenn die Person
ein Wort anfasst.

### Der Import

Ich reiche euch künftig **ein ZIP** durch die Vordertür statt loser Dateien –
genau das, was auch ein Fremder mitbringt. Damit gibt es nur noch einen Weg
herein.

Ob ihr `importFiles(contents, label)` behalten und das Archiv vorher selbst
auspacken wollt oder eine zweite Tür für ZIPs aufmacht, entscheidet ihr. Sagt
mir nur, wie die Tür am Ende heißt und was sie nimmt – ich richte mich danach.

Dahinter: auspacken, prüfen, `dictionary.json` ins zentrale Wörterbuch
einarbeiten, `package.json`/`text.json`/`audio/` ablegen. Das Wörterbuch des
Pakets wird **nicht** abgelegt, das Archiv auch nicht.

### Die Abgleichregel

Jeder Eintrag trägt `schema` – die Nummer des Bauplans, nach dem er
geschrieben wurde.

- Schlüssel noch nicht da: aufnehmen.
- Schon da: **ersetzen, wenn `schema` höher ist**, sonst liegen lassen.

Kein Zusammenführen einzelner Felder. Im zentralen Wörterbuch steht nichts
von der Person, es ist jederzeit aus den Paketen neu aufbaubar.

### Gelesen wird nur noch von dort

Beide Wege zur Wortkarte und die Karteikarte holen Bedeutung, Formen und
Beschreibung aus dem zentralen Wörterbuch. `lookupWord` in
`learning/occurrences.js` wird damit zu einem Blick in eine Datei statt einer
Suche über alle Pakete. Die Karteikarte behält Level und Wiedervorlage, gibt
aber Vorder- und Rückseite ab; sie hängt nur noch am Schlüssel.

### Die Migration

Das ist der unangenehme Teil, und er liegt bei euch, weil die Dateien euch
gehören:

1. Aus allen vorhandenen Paketen das zentrale Wörterbuch aufbauen. Einträge
   aus alten Paketen zählen als `schema: 0` und werden später von jedem
   neueren Paket abgelöst.
2. `dictionary/` nach `notes/` umbenennen.
3. In jedem Paketordner `paragraphs` aus der `package.json` nach `text.json`
   herausziehen, `dictionary` daraus entfernen, `schemaVersion` auf 2.
4. Karteikarten: `front`/`back` fallen weg, der Schlüssel entscheidet. Was die
   Person auf eine Karte geschrieben hat, bleibt.

Pakete der ersten Fassung müssen importierbar bleiben – sie liegen auf
fremden Rechnern. Erkennungsmerkmal ist `schemaVersion`.

## Was ich mache

- Die Werkstatt auf die Phasen umbauen, die dahinterliegen, und auf drei
  Knöpfe: Ingest, Record, Deploy.
- Ein zentrales Wörterbuch in der Werkstatt – das gibt es dort im Grunde
  schon, es wird nur aus vielen Notizen eine Datei.
- Das ZIP herstellen. Dafür brauche ich in `core/zip.js` ein Gegenstück zu
  `readZip` – **das ist eine Änderung in `core/`**. Ich füge nur hinzu, ich
  fasse `readZip` nicht an. Sagt Bescheid, wenn euch das stört.
- `core/package.js` muss die Prüfung über drei Dateien statt einer können.
  **Auch `core/`.** Hier schlage ich vor: Ich baue es, ihr schaut drüber –
  `validatePackage` bleibt die eine Prüfung für beide Seiten, das ändert sich
  nicht.

## Was ich von euch brauche

1. **Einverstanden mit `paketformat-2.md`?** Wenn ja, ersetzt es
   `paketformat.md`; ich schreibe das dann um.
2. **Wie heißt die Vordertür für ein ZIP**, und was nimmt sie?
3. **Widerspruch zu meinen Änderungen in `core/`?**

Mehr nicht. Alles Weitere entscheiden wir getrennt.
