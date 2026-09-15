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
| `glossLanguage` | ja | Sprache der G-Ebene. Zurzeit immer `de`. |
| `fluentLanguage` | ja | Sprache der T-Ebene. Zurzeit immer `de`. |
| `level` | nein | `A1`…`C2`. |
| `topics` | nein | Kurze englische Schlagwörter, klein. Erscheinen in der Paketliste. |
| `paragraphs` | ja | Der Text. |
| `dictionary` | ja | Wörterbucheinträge zu allen vorkommenden Schlüsseln. |

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
| `key` | ja | Paketübergreifender Wissensschlüssel, siehe unten. |

Einheiten stehen in Lesereihenfolge und dürfen sich nicht überlappen.

### Wortarten

`NOUN` `PROPN` `VERB` `AUX` `ADJ` `ADV` `PRON` `DET` `ADP` `NUM`
`CCONJ` `SCONJ` `PART` `INTJ`

### Schlüssel

```text
<language>:<lemma>:<partOfSpeech>
```

Kleingeschrieben bis auf den Wortart-Tag. Beispiel: `bg:куче:NOUN`.

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

## Wendungen (phrases)

Eine Wendung ist eine **feste Mehrwortverbindung, deren Bedeutung nicht aus den
Einzelwörtern folgt**. Sie ist eine eigene Lerneinheit mit eigenem Schlüssel und
eigenem Lernstand – **zusätzlich** zu den Wörtern darunter, nicht an ihrer
Stelle. Die Wörter behalten ihre Einheiten und ihre wörtlichen Glossen.

```json
"phrases": [
  {
    "start": 24,
    "end": 39,
    "surface": "s'il vous plaît",
    "gloss": "bitte",
    "lemma": "s'il vous plaît",
    "key": "fr:s'il vous plaît:PHRASE"
  }
]
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `start`, `end` | ja | Wie bei Einheiten. **Muss an Einheitengrenzen liegen**: `start` ist der `start` einer Einheit, `end` der `end` einer späteren Einheit im selben Satz. |
| `surface` | ja | Muss exakt `source.slice(start, end)` sein. |
| `gloss` | ja | Die **natürliche** deutsche Bedeutung – hier gilt die Flachheitsregel der G-Ebene ausdrücklich **nicht**. `s'il vous plaît` → `bitte`, nicht `wenn es Ihnen gefallen`. |
| `lemma` | ja | Grundform der Wendung, meist gleich `surface`. Flektierte Bestandteile werden hier normalisiert, z.B. `il y avait` → `il y a`. |
| `key` | ja | `<language>:<lemma>:PHRASE`, Grundform klein. |

Eine Wendung umfasst mindestens zwei Einheiten. Wendungen überlappen sich nicht.

Im Reader erscheint die Wendung als Klammer unter den Wortglossen:

```text
Je voudrais une chambre, s'il vous plaît.
ich wollen  eine Zimmer   wenn es Ihnen gefallen
                          └──────  bitte  ──────┘
```

Wort und Wendung werden getrennt angeklickt und haben getrennte Lernstände.

### Was eine Wendung ist – und was nicht

Aufnehmen, wenn die Verbindung fest ist und als Ganzes gelernt wird:

- Höflichkeitsformeln: `s'il vous plaît`, `bien sûr`, `d'accord`, `de rien`
- grammatische Fügungen: `il y a`, `est-ce que`, `c'est`, `je voudrais`
- feste Begriffe: `mot de passe`, `petit déjeuner`, `carte d'identité`
- bulgarisch: `добър ден`, `как си`, `няма защо`

Nicht aufnehmen: gewöhnliche Wortfolgen, deren Bedeutung sich aus den Teilen
ergibt (`une chambre double`, `малко момче`). Im Zweifel weglassen – eine zu
großzügige Wendungsliste macht den Text unruhig und lernt nichts Zusätzliches.

## Die G-Ebene: wie flach gloss't wird

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
| `grammar` | nein | Deutsche Grammatiknotiz, ein bis drei Sätze. Genau das, was man beim Lernen wissen will. |

Beim Import legt das Plugin daraus Wortnotizen in `dictionary/` an. Kennt es
einen Schlüssel schon, ergänzt es nur fehlende Angaben – **Lernstand und eigene
Notizen der Person werden nie überschrieben.**

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
7. Gleiche Grundform und Wortart ergeben immer denselben `key`.
8. `source.slice(start, end) === surface` für jede Wendung; ihre Grenzen liegen
   auf Einheitengrenzen; Wendungen überlappen sich nicht und umfassen mindestens
   zwei Einheiten.
9. Alle `audio.file`-Verweise zeigen auf vorhandene Dateien.
10. Die Datei ist gültiges JSON in UTF-8, ohne BOM.
