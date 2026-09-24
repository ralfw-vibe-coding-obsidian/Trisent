# Spezifikation: Textpaket (schemaVersion 2)

Verbindlich für die Werkstatt (Packager) *und* für die Bibliothek (Learning).
Feldnamen sind englisch. Lerninhalte (Glossen, Übersetzungen, Grammatiknotizen)
stehen in der Sprache der Person.

Geprüft wird beides mit demselben Code: `core/package.js`. Was dort
durchgeht, gilt als Paket - auf beiden Seiten.

## Ein Paket ist ein ZIP

```text
package.zip
├── package.json      Kopf
├── text.json         der Text
├── dictionary.json   ein Eintrag je Schlüssel, der im Text vorkommt
└── audio/            eine Datei je Satz, optional
```

Der Name des Archivs ist frei. In der Werkstatt heißt es `package.zip`; die
Kopie, die Deploy in die Inbox legt, heißt nach Text und Sprache. Was zählt,
ist der Inhalt. Die Paketdatei darf im Archiv auch in einem Ordner liegen.

Das Paket muss **für sich stehen**: Es bringt alle Erklärungen mit, die sein
Text braucht, und funktioniert in einer Vault, die nichts davon kennt.

## Wie ein Paket in die Bibliothek kommt

Werkstatt und Bibliothek teilen sich **keine Funktion**, nur einen Ordner und
diese Dateiform.

```text
Trisent/                      einstellbar, Vorgabe: Trisent
├── packager/                 die Werkstatt
├── inbox/                    fertige Pakete als ZIP
├── learning/                 die Bibliothek der Person
│   └── FR/
│       ├── language.md
│       ├── dictionary.json   das Wörterbuch: jeder Eintrag, der je importiert wurde
│       ├── notes/            Wortnotizen der Person - on demand
│       ├── flashcards/
│       ├── sentences/
│       └── packages/
│           └── Beliebig/Tief/Verschachtelt/Paul et Julie/
│               ├── package.json   nur der Kopf
│               ├── text.json
│               └── audio/
└── log.md                    was die App getan hat
```

**Deploy** legt ein fertiges Paket in die Inbox. Von dort holt die Person es
ab - um es weiterzugeben, oder um es in ihre Bibliothek zu importieren. Nur der
**Import** schreibt in die Bibliothek, und nur, was die Prüfung besteht.

Beim Import:

1. Auspacken und prüfen.
2. Das Paket an seiner `id` wiedererkennen; sonst einen neuen Ordner anlegen.
3. `dictionary.json` **zuerst** in das Wörterbuch der Sprache einarbeiten -
   so bleibt bei einem Abbruch schlimmstenfalls ein Eintrag ohne Text zurück,
   nie ein Text ohne Erklärungen.
4. `package.json`, `text.json` und `audio/` ablegen. Das Wörterbuch des
   Pakets wird **nicht** abgelegt, das Archiv auch nicht.

Ein Ordner **ist** ein Lernpaket, genau dann wenn eine `package.json` direkt
darin liegt. Ein Paket enthält keine weiteren Pakete. Der Ordnername ist frei
wählbar; angezeigt wird immer `title` aus der Paketdatei.

## Kopf: package.json

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

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `schemaVersion` | ja | `2`: Text und Wörterbuch liegen daneben. |
| `id` | ja | Stabil über Aktualisierungen hinweg. Kleinbuchstaben, Ziffern, Bindestriche. Daran erkennt die App, dass ein Import dasselbe Paket in neuer Fassung ist. |
| `version` | ja | Ganze Zahl, steigt bei jeder neuen Fassung. |
| `title` | ja | Titel in der Fremdsprache. |
| `titleTranslation` | nein | Titel in der Sprache der Person. |
| `language` | ja | Sprachcode der Fremdsprache, klein (`bg`, `fr`). Muss zum Sprachordner passen. |
| `glossLanguage` | ja | Sprachcode der Person, klein – die Sprache der G-Ebene. Aus derselben Liste wie `language`. |
| `fluentLanguage` | ja | Sprachcode der Person, klein – die Sprache der T-Ebene. |
| `level` | nein | `A1`…`C2`. |
| `topics` | nein | Kurze englische Schlagwörter, klein. Erscheinen in der Paketliste. |

Der Kopf trägt **weder** `paragraphs` **noch** `dictionary` - sonst wäre nicht
klar, welche Fassung gilt.

**Die Sprache der Person steht im Paket, nicht im Code.** Ein Franzose, der
Spanisch lernt, bekommt französische Glossen und `"glossLanguage": "fr"`. Der
Reader liest beide Ebenen, ohne eine bestimmte Sprache vorauszusetzen; nur seine
Oberfläche ist englisch.

## Text: text.json

```json
{ "paragraphs": [] }
```

Was darin steht, beschreiben die folgenden Abschnitte.

## Absätze und Sätze

```json
"paragraphs": [
  {
    "id": "p001",
    "speaker": "Réceptionniste",
    "sentences": [
      {
        "id": "s001",
        "source": "Макс е дружелюбно куче.",
        "fluent": "Max ist ein freundlicher Hund.",
        "units": []
      }
    ]
  }
]
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `paragraphs[].id` | ja | Im Paket eindeutig. Muster `p001`. |
| `paragraphs[].speaker` | nein | Nur bei Dialogen. Wird über dem Absatz angezeigt. |
| `sentences[].id` | ja | Im **ganzen Paket** eindeutig, durchlaufend. Muster `s001`. |
| `sentences[].source` | ja | Der Originalsatz, exakt und unverändert. Einzeilig, keine Zeilenumbrüche. |
| `sentences[].fluent` | ja | Natürlicher deutscher Satz (T-Ebene). |
| `sentences[].units` | ja | Die anklickbaren Wörter (F- und G-Ebene). |
| `sentences[].phrases` | nein | Feste Wendungen über mehreren Wörtern. |
| `sentences[].audio` | nein | Siehe unten. |

## Einheiten (units)

Eine Einheit ist ein **lernbares Wort**. Satzzeichen und Leerzeichen bekommen
keine Einheit – dafür sind die Zeichenpositionen da.

```json
{
  "start": 7,
  "end": 18,
  "surface": "дружелюбно",
  "gloss": "freundlich",
  "lemma": "дружелюбен",
  "partOfSpeech": "ADJ",
  "key": "bg:дружелюбен:ADJ"
}
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `start`, `end` | ja | Zeichenpositionen in `source`, halboffenes Intervall `[start, end)`. Gezählt wird wie JavaScript zählt. Für Kyrillisch und Französisch ist das identisch mit der Zählung in Python. |
| `surface` | ja | Die Form im Text. **Muss exakt `source.slice(start, end)` sein.** Das ist die wichtigste Prüfregel überhaupt. |
| `gloss` | ja | Möglichst flache deutsche Wort-für-Wort-Entsprechung (G-Ebene). |
| `lemma` | ja | Grundform in der Fremdsprache. Bei Eigennamen gleich `surface`. |
| `partOfSpeech` | ja | Ein Tag aus der Liste unten. |
| `key` | ja | Paketübergreifender Wissensschlüssel, siehe unten. **Muss aus `lemma` und `partOfSpeech` folgen** – `keyFor()` in `core/package.js` bildet ihn. |

Einheiten stehen in Lesereihenfolge und dürfen sich nicht überlappen.

### Wortarten

`NOUN` `PROPN` `VERB` `AUX` `ADJ` `ADV` `PRON` `DET` `ADP` `NUM`
`CCONJ` `SCONJ` `PART` `INTJ`

### Schlüssel

```text
<language>:<lemma>:<partOfSpeech>
```

Kleingeschrieben bis auf den Wortart-Tag. Beispiel: `bg:куче:NOUN`.

**Bilde ihn nie selbst, sondern mit `keyFor()` aus `core/package.js`.** Die
Funktion vereinheitlicht vorher, was sonst unbemerkt zwei Karteikarten für
dasselbe Wort erzeugt:

- **Unicode-Form.** `é` kann ein Zeichen sein oder zwei (e + Akzent). Beides
  sieht gleich aus, ist als Zeichenkette aber verschieden.
- **Apostrophe.** Der gerade (`'`) und der typografische (`’`) kommen beide in
  echten Texten vor. `s'il` und `s’il` müssen denselben Schlüssel ergeben.
- Mehrfache und randständige Leerzeichen, Groß- und Kleinschreibung.

Die Prüfung setzt das durch: Sie rechnet den Schlüssel aus `lemma` und
`partOfSpeech` nach und lehnt das Paket ab, wenn er nicht dazu passt. Der
Schlüssel ist damit keine freie Angabe, sondern eine **Folge** – zwei Pakete
können nicht mehr auseinanderlaufen, ohne dass vorher eines durchgefallen ist.

Alle Formen desselben Lexems teilen sich einen Schlüssel – `куче` und `кучето`
ergeben beide `bg:куче:NOUN`. Daran hängt der Lernstand.

Gleich geschriebene Wörter mit verschiedener Funktion bekommen verschiedene
Schlüssel, weil sich die Wortart unterscheidet:

```text
bg:съм:AUX
bg:си:PRON
```

Nur wenn sich **Wortart und Grundform gleichen** und trotzdem zwei verschiedene
Wörter gemeint sind, wird ein Bedeutungszusatz angehängt:

```text
bg:ключ:NOUN:key
bg:ключ:NOUN:spring
```

## Die G-Ebene: wie flach gloss't wird

Die Beispiele hier sind deutsch, weil die erprobten Pakete es sind – der
Grundsatz gilt für jede `glossLanguage`.

Die Glosse ist **kein gutes Deutsch**. Sie ist ein Fenster auf den Bau der
Fremdsprache. Deshalb gilt:

- Verben in der Grundform: `е` → `sein`, nicht `ist`.
- Im Wort steckende Grammatik wird sichtbar gemacht: `градината` → `der Garten`,
  nicht `im Garten`. Der Artikel steckt in der bulgarischen Endung, also muss er
  in der Glosse auftauchen.
- Keine deutsche Flexion: `малката къща` → `die klein | Haus`.
- Keine Umstellung, keine Ergänzung, kein Weglassen. Ein Wort, eine Glosse.
- Was wirklich keine Entsprechung hat, bekommt `—`.

Die Bedeutung transportiert die T-Ebene, nicht die G-Ebene.


## Wörterbuch: dictionary.json

Ein Eintrag je vorkommendem Schlüssel - als eigene Datei, nicht im Kopf.
Vollständigkeit ist Pflicht: jeder `key`
aus den Einheiten **und aus den Wendungen** muss hier stehen. Wendungen tragen
`partOfSpeech: "PHRASE"`; ihre `grammar`-Notiz erklärt, wörtlich was dasteht und
wann man es benutzt.

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

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `lemma` | ja | Grundform. |
| `partOfSpeech` | ja | Wie oben. |
| `gloss` | ja | Deutsche Grundbedeutung. Darf ausführlicher sein als die Glosse im Satz. |
| `forms` | nein | Alle Formen, die die Werkstatt von diesem Wort kennt - nicht nur die aus diesem Text. |
| `grammar` | nein | Deutsche Grammatiknotiz, ein bis drei Sätze. Genau das, was man beim Lernen wissen will. **Markdown** – der Reader zeichnet sie als solches. |
| `entrySchema` | nein | Nach welcher Fassung des Bauplans die Beschreibung geschrieben wurde. Ganze Zahl von 0 bis 1000; fehlt sie, gilt 0. |

**`entrySchema` ist nicht `schemaVersion`.** Das eine ist die Fassung des
Bauplans für Beschreibungen, das andere die Fassung des Paketformats.

Sie steht am einzelnen Eintrag, nicht am Paket: Die Werkstatt schlägt nur
nach, was ihr fehlt, also enthält ein Paket zwangsläufig Einträge aus
mehreren Zeitaltern. Die Obergrenze ist Absicht - beim Import gewinnt die
höhere Nummer, und eine absurd hohe würde einen Eintrag für immer festhalten.

### Die Abgleichregel beim Import

Für jeden Schlüssel aus dem Paket:

- Steht er noch nicht im Wörterbuch der Sprache: **aufnehmen**.
- Steht er schon dort: **ersetzen, wenn `entrySchema` höher ist**, sonst
  liegen lassen.

Im Wörterbuch steht nichts, was die Person geschrieben hat - es ist jederzeit
aus den Paketen neu aufbaubar. Einträge, deren Paket gelöscht wird, bleiben.

### Word entry und Word note

Ein Eintrag im Wörterbuch heißt **Word entry**. Die Wortkarte zeigt ihn aus dem
Wörterbuch der Sprache - gleich, aus welchem Text sie geöffnet wird. Ein Wort,
eine Erklärung.

Eine **Word note** in `notes/` gehört der Person und entsteht erst, wenn sie das
Wort anfasst. **In sie wird nichts kopiert, was im Word entry steht** - kein
`gloss`, keine `forms`, keine `grammar`:

```markdown
---
type: word
language: fr
lemma: entrée
partOfSpeech: NOUN
key: "fr:entrée:NOUN"
status: familiar
updatedAt: 2026-09-19
---
## My notes
```

Wer das Wort ist, wie weit die Person damit ist, und was sie sich selbst
notiert. Eine Abschrift der Erklärung veraltete still, während die Wortkarte
längst eine bessere zeigt.

## Audio

Optional. Fehlt es, blendet die App die Abspielknöpfe einfach aus.

```json
"audio": {
  "file": "audio/s001.mp3",
  "durationMs": 2840,
  "timings": [
    { "unit": 0, "startMs": 0, "endMs": 510 }
  ]
}
```

`file` ist relativ zum Paketordner. `timings` ist optional und verweist mit
`unit` auf den Index in `units`.

## Prüfregeln vor dem Export

1. `source.slice(start, end) === surface` für **jede** Einheit.
2. Einheiten überlappen sich nicht und stehen aufsteigend.
3. Jede Einheit hat `gloss`, `lemma`, `partOfSpeech` und `key`.
4. Jeder Satz hat `fluent`.
5. Absatz- und Satz-IDs sind eindeutig.
6. Jeder `key` aus den Einheiten und den Wendungen hat einen Eintrag in
   `dictionary.json` - und jeder Eintrag dort wird benutzt.
7. Jeder `key` folgt aus `lemma` und `partOfSpeech` – geprüft gegen `keyFor()`.
   Ein Bedeutungszusatz ist erlaubt; geprüft wird der Teil davor.
   Jede `partOfSpeech` ist einer der vierzehn erlaubten Tags.
8. `source.slice(start, end) === surface` für jede Wendung; ihre Grenzen liegen
   auf Einheitengrenzen; Wendungen überlappen sich nicht und umfassen mindestens
   zwei Einheiten.
9. Alle `audio.file`-Verweise zeigen auf vorhandene Dateien.
10. Die Dateien sind gültiges JSON in UTF-8, ohne BOM.
11. `entrySchema` ist, wo es steht, eine ganze Zahl von 0 bis 1000.
12. Alle drei Dateien sind da, und der Kopf trägt weder `paragraphs` noch
    `dictionary`.

## Die Prüfung in core/package.js

- `validateParts(files)` prüft ein ausgepacktes Paket - `files` ist eine Map von
  Pfad auf Inhalt. Es liest die drei Dateien, setzt sie mit `joinPackage`
  zusammen und schickt das Ganze durch `validatePackage`. Ergebnis:
  `{ data, problems }`.
- `validatePackage(data, files)` prüft die zusammengesetzte Form nach den Regeln
  oben, dazu: `entrySchema` ist eine ganze Zahl von 0 bis 1000.
- `splitPackage(data)` teilt ein Paket in `{ head, text, dictionary }`.

## Pakete der ersten Fassung

Bis September 2026 war ein Paket ein Ordner mit einer einzigen `package.json`,
in der `paragraphs` und `dictionary` mit im Kopf standen (`schemaVersion: 1`).
Solche Pakete liegen auf fremden Rechnern und bleiben importierbar:
`validatePackage` prüft sie wie damals, der Import behandelt ihre Einträge als
`entrySchema: 0`. Beim Start bringen beide Seiten ihre vorhandenen Pakete in
die heutige Form - ohne neue Nummer, am Inhalt ändert sich nichts.
