# Spezifikation: Textpaket (schemaVersion 1)

Verbindlich für die Verpackungsanwendung *und* für das Obsidian-Plugin.
Feldnamen sind englisch. Lerninhalte (Glossen, Übersetzungen, Grammatiknotizen)
sind deutsch.

## Ablage in der Vault

```text
Trisent/                      ← einstellbar, Vorgabe: Trisent
├── reader/                   ← Bereich des Readers
│   └── BG/                   ← Sprachordner, erkennbar an language.md
│       ├── language.md
│       ├── dictionary/       ← Wortnotizen, gehören der Person
│       └── packages/
│           └── Beliebig/Tief/Verschachtelt/
│               └── Der Junge und der Hund/
│                   ├── package.json
│                   └── audio/            ← optional
└── packager/                 ← Bereich des Packagers
```

Die beiden Bereiche sind getrennt. **Ein Paket gelangt nur über den Import in
den Bereich des Readers** – und damit nur, wenn es die Prüfregeln am Ende
dieses Dokuments besteht. Auch ein Paket vom Packager nimmt diesen Weg.

Technisch gibt es dafür zwei Türen und einen Weg dahinter:

- `Library.importZip(bytes, label)` – eine ZIP-Datei von außen, wird entpackt
  und dann weitergereicht an
- `Library.importFiles(contents, label)` – `contents` ist eine Map von Pfad
  (relativ zum Paketordner) auf Bytes. Hier prüft, ordnet und schreibt der
  Import. Der Packager benutzt diese Tür direkt, ohne Umweg über ein Archiv.

Ein Ordner **ist** ein Lernpaket, genau dann wenn eine `package.json` direkt
darin liegt. Ein Paket enthält keine weiteren Pakete. Der Ordnername ist frei
wählbar; angezeigt wird immer `title` aus der Paketdatei.

## Kopf der Paketdatei

```json
{
  "schemaVersion": 1,
  "id": "bg-boy-and-dog",
  "version": 1,
  "title": "Момчето и кучето",
  "titleTranslation": "Der Junge und der Hund",
  "language": "bg",
  "glossLanguage": "de",
  "fluentLanguage": "de",
  "level": "A1",
  "topics": ["animals", "friendship", "family"],
  "paragraphs": [],
  "dictionary": {}
}
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `schemaVersion` | ja | Immer `1`. |
| `id` | ja | Stabil über Aktualisierungen hinweg. Kleinbuchstaben, Ziffern, Bindestriche. Daran erkennt die App, dass ein Import dasselbe Paket in neuer Fassung ist. |
| `version` | ja | Ganze Zahl, steigt bei jeder neuen Fassung. |
| `title` | ja | Titel in der Fremdsprache. |
| `titleTranslation` | nein | Deutscher Titel. |
| `language` | ja | Sprachcode der Fremdsprache, klein (`bg`, `fr`). Muss zum Sprachordner passen. |
| `glossLanguage` | ja | Sprachcode der Person, klein – die Sprache der G-Ebene. Aus derselben Liste wie `language`. |
| `fluentLanguage` | ja | Sprachcode der Person, klein – die Sprache der T-Ebene. |
| `level` | nein | `A1`…`C2`. |
| `topics` | nein | Kurze englische Schlagwörter, klein. Erscheinen in der Paketliste. |
| `paragraphs` | ja | Der Text. |
| `dictionary` | ja | Wörterbucheinträge zu allen vorkommenden Schlüsseln. |

**Die Sprache der Person steht im Paket, nicht im Code.** Ein Franzose, der
Spanisch lernt, bekommt französische Glossen und `"glossLanguage": "fr"`. Der
Reader liest beide Ebenen, ohne eine bestimmte Sprache vorauszusetzen; nur seine
Oberfläche ist englisch.

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

## Wörterbuch

Ein Eintrag je vorkommendem Schlüssel. Vollständigkeit ist Pflicht: jeder `key`
aus den Einheiten **und aus den Wendungen** muss hier stehen. Wendungen tragen
`partOfSpeech: "PHRASE"`; ihre `grammar`-Notiz erklärt, wörtlich was dasteht und
wann man es benutzt.

```json
"dictionary": {
  "bg:куче:NOUN": {
    "lemma": "куче",
    "partOfSpeech": "NOUN",
    "gloss": "Hund",
    "forms": ["куче", "кучето", "кучета"],
    "grammar": "Neutrum. Bestimmte Form: кучето. Plural: кучета."
  }
}
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `lemma` | ja | Grundform. |
| `partOfSpeech` | ja | Wie oben. |
| `gloss` | ja | Deutsche Grundbedeutung. Darf ausführlicher sein als die Glosse im Satz. |
| `forms` | nein | Formen, die im Paket vorkommen oder häufig sind. |
| `grammar` | nein | Deutsche Grammatiknotiz, ein bis drei Sätze. Genau das, was man beim Lernen wissen will. **Markdown** – der Reader zeichnet sie als solches. |

### Das Paket ist die einzige Quelle

Der Reader zeigt diese Angaben auf der Wortkarte **direkt aus dem Paket**. Eine
Wortnotiz in `dictionary/` entsteht erst, wenn die Person das Wort zum ersten
Mal antippt – der Ordner enthält also die Wörter, mit denen sie sich befasst
hat, nicht alle, die vorkommen.

**In die Wortnotiz wird nichts kopiert, was im Paket steht.** Sie enthält nur:

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

Also: wer das Wort ist, wie weit die Person damit ist, und was sie sich selbst
notiert. **Kein `gloss`, keine `forms`, keine `grammar`.** Die gehören dem
Paket und dürfen sich mit einer besseren Fassung ändern; eine Abschrift daneben
veraltete still, während die Wortkarte längst etwas anderes zeigt. Gelesen wird
aus der Notiz ohnehin nur `key` und `status`.

Damit erledigt sich auch die Frage, ob ein Import vorhandene Wortnotizen
ergänzen soll: **Es gibt dort nichts zu ergänzen.** Ein neues Paket bringt eine
bessere Erklärung mit, und die Wortkarte zeigt sie – ohne irgendetwas
anzufassen, das der Person gehört.

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
6. Jeder `key` aus den Einheiten und den Wendungen hat einen Eintrag in `dictionary`.
7. Jeder `key` folgt aus `lemma` und `partOfSpeech` – geprüft gegen `keyFor()`.
   Ein Bedeutungszusatz ist erlaubt; geprüft wird der Teil davor.
   Jede `partOfSpeech` ist einer der vierzehn erlaubten Tags.
8. `source.slice(start, end) === surface` für jede Wendung; ihre Grenzen liegen
   auf Einheitengrenzen; Wendungen überlappen sich nicht und umfassen mindestens
   zwei Einheiten.
9. Alle `audio.file`-Verweise zeigen auf vorhandene Dateien.
10. Die Datei ist gültiges JSON in UTF-8, ohne BOM.
