# Konzept: Adaptiver interlinearer Sprachreader

## Kurzfassung

Die Anwendung verwandelt beliebige Texte in interlineares Lernmaterial. Jeder Satz wird auf drei Ebenen dargestellt:

1. Originaltext in der Fremdsprache
2. möglichst flache Wort-für-Wort-Glossierung auf Deutsch
3. natürliche, flüssige deutsche Übersetzung

Beim Lesen klassifiziert der Nutzer fremdsprachige Wörter durch Anklicken. Der Status eines Wortes gilt nicht nur im aktuellen Satz, sondern über alle Texte hinweg. Dadurch entsteht beim Lesen schrittweise ein persönliches Wissensmodell.

> Beliebige Texte werden wortweise verständlich und verwandeln sich beim Lesen schrittweise von übersetzten in fremdsprachige Texte.

## Produktkern

Die Anwendung ist weder nur ein Übersetzer noch nur eine Vokabelkartei. Ihr Kern ist ein **adaptiver interlinearer Reader mit textübergreifendem Wortgedächtnis**.

Der zentrale Lernkreislauf:

1. Einen beliebigen Text als Lernpaket aufbereiten.
2. Original, Wortglossen und flüssige Übersetzung gemeinsam lesen.
3. Den eigenen Kenntnisstand unmittelbar an den Wörtern markieren.
4. Den Wortstatus auf alle Texte übertragen.
5. Übersetzungshilfen verschwinden lassen, sobald Wörter sicher erkannt werden.
6. Wörter bei Bedarf in ein Spaced-Repetition-System übernehmen.
7. Weitere Vorkommen eines Wortes im Satzkontext untersuchen.

Die Leitidee lautet:

> Texte lesen. Wörter lernen. Wissen mitnehmen.

## Die drei Darstellungsebenen

### 1. Fremdsprachlicher Originaltext

Der Ausgangstext wird vollständig und unverändert angezeigt. Schriftbild, Großschreibung und Satzzeichen bleiben erhalten.

### 2. Wörtliche deutsche Glossierung (wDE)

Jedes fremdsprachige Wort erhält eine möglichst direkte deutsche Wörterbuchform. Deutsche Grammatik, Flexion und natürlicher Satzbau werden auf dieser Ebene bewusst nicht ergänzt.

Beispiel Englisch:

| EN | You | are | a | friendly | dog |
|---|---|---|---|---|---|
| wDE | Du | sein | ein | freundlich | Hund |

Beispiel Bulgarisch:

| BG | в | градината |
|---|---|---|
| wDE | in | der Garten |

Die ungewöhnliche Form „in der Garten“ ist hier beabsichtigt. Sie zeigt, dass der bestimmte Artikel in der bulgarischen Wortform „градината“ enthalten ist. Eine grammatisch geglättete Übersetzung wie „im Garten“ würde diese Information verdecken.

Weitere Beispiele:

| BG | малката | къща |
|---|---|---|
| wDE | die klein | Haus |

| BG | ам / е | looking / — | for / — |
|---|---|---|---|
| wDE | sein | suchen | nach |

Die Glossierung dient als grammatisches Sichtfenster auf die Ausgangssprache, nicht als korrektes Deutsch.

### 3. Flüssige deutsche Übersetzung (fDE)

Unter der Wortglossierung steht ein natürlicher deutscher Satz:

> Du bist ein freundlicher Hund.

Diese Ebene vermittelt die tatsächliche Bedeutung und übernimmt alle notwendigen Anpassungen an deutschen Satzbau, Kasus, Idiomatik und Stil.

## Benutzeroberfläche

### Satzdarstellung

- Jeder Satz bildet einen eigenen übersichtlichen Block.
- Fremdsprachige Wörter stehen in normaler, gut lesbarer Schrift.
- Die wDE-Glossen stehen unmittelbar unter den zugehörigen Wörtern und sind optisch etwas heller.
- Die flüssige Übersetzung steht unter dem gesamten Satz und ist nochmals heller.
- Absätze des Ausgangstextes bleiben als deutlich getrennte Absätze erhalten.
- Kennzeichnungen wie „EN“, „BG“, „wDE“ oder „fDE“ stehen nicht vor den Zeilen.

### Wortstatus

Ein einfacher Klick auf ein fremdsprachiges Wort schaltet zyklisch durch vier Zustände:

| Status | Darstellung | Bedeutung |
|---|---|---|
| unknown | leicht rot | unbekannt |
| learning | leicht gelb | wird gelernt |
| familiar | leicht grau | weitgehend bekannt |
| known | weiß | bekannt; wDE-Glosse wird ausgeblendet |

Statusfolge:

```text
unknown → learning → familiar → known → unknown
```

Der Status wird semantisch gespeichert und nicht als Farbwert. Dadurch kann das Design später geändert werden, ohne Lerndaten migrieren zu müssen.

Wenn sich der Status eines Wortes ändert, werden alle sichtbaren Vorkommen mit demselben Wissensschlüssel sofort aktualisiert.

### Weitere Ansichten

Zu einem Wort sollen aufrufbar sein:

- alle Vorkommen im aktuellen Text;
- alle Vorkommen in anderen Texten;
- die jeweiligen vollständigen Satzkontexte;
- Grundform, Wortart und gegebenenfalls grammatische Form;
- zugehörige Mehrwortausdrücke;
- Aufnahme in die Lernkartei;
- Wiederholungsverlauf im Spaced-Repetition-System.

Die Texte und Wortvorkommen bilden dadurch ein navigierbares Textnetz.

## Wortmodell

Die sichtbare Wortform allein genügt nicht als Identität eines Lernobjekts. Verschiedene flektierte Formen können zum selben Lexem gehören, während gleich geschriebene Wörter unterschiedliche Bedeutungen haben können.

Eine Texteinheit sollte deshalb mindestens enthalten:

- `surface`: konkrete Form im Text;
- `gloss`: wörtliche deutsche Glosse;
- `lemma`: Grundform;
- `partOfSpeech`: Wortart;
- `knowledgeKey`: paketübergreifender Schlüssel des Lernobjekts;
- optional `formKey`: Schlüssel der konkreten grammatischen Form.

Beispiel:

```json
{
  "surface": "е",
  "gloss": "sein",
  "lemma": "съм",
  "partOfSpeech": "AUX",
  "knowledgeKey": "bg:съм:AUX",
  "formKey": "bg:съм:AUX:3SG.PRES"
}
```

### Lemma und Wortform

Für einen ersten Produktstand kann der Lernstatus am `knowledgeKey` hängen. Dadurch teilen beispielsweise mehrere Formen eines Verbs denselben Status.

Später kann das Wissensmodell zwei getrennte Aussagen speichern:

- Der Nutzer kennt das Lexem grundsätzlich.
- Der Nutzer erkennt eine bestimmte flektierte Form.

Das ist bei Sprachen mit ausgeprägter Morphologie besonders wertvoll.

### Homonyme

Gleich geschriebene Wörter mit verschiedenen Funktionen benötigen getrennte Wissensschlüssel:

```text
bg:си:AUX
bg:си:PRON:possessive-reflexive
```

Falls auch unterschiedliche Wortbedeutungen getrennt gelernt werden sollen, kann ein Bedeutungsschlüssel ergänzt werden:

```text
bg:ключ:NOUN:key
bg:ключ:NOUN:spring
```

## Textpakete

### Grundprinzip

Inhalt und persönlicher Lernzustand werden strikt getrennt:

- Das Textpaket enthält unveränderliche Sprachdaten, Übersetzungen und Audio.
- Das Obsidian-Plugin speichert das persönliche Wissensmodell separat.

Für den ersten Produktstand ist ein normaler Ordner transparenter und einfacher als ein proprietäres Binärformat:

```text
dog-cat-bg/
├── package.json
└── audio/
    ├── s001.mp3
    ├── s002.mp3
    ├── s003.mp3
    └── ...
```

Für die Weitergabe kann der Ordner als ZIP-Datei oder mit einer eigenen Dateiendung wie `.interlinear` verpackt werden. Beim Import entpackt das Plugin ihn in den Vault.

### Beispiel für package.json

```json
{
  "schemaVersion": 1,
  "id": "dog-cat-bg-de-001",
  "title": "Кучето и котката",
  "sourceLanguage": "bg",
  "glossLanguage": "de",
  "fluentLanguage": "de",
  "paragraphs": [
    {
      "id": "p001",
      "sentences": [
        {
          "id": "s001",
          "source": "Макс е дружелюбно куче.",
          "fluent": "Max ist ein freundlicher Hund.",
          "audio": {
            "file": "audio/s001.mp3"
          },
          "units": [
            {
              "start": 0,
              "end": 4,
              "surface": "Макс",
              "gloss": "Max",
              "knowledgeKey": "bg:max:PROPN"
            },
            {
              "start": 5,
              "end": 6,
              "surface": "е",
              "gloss": "sein",
              "lemma": "съм",
              "partOfSpeech": "AUX",
              "knowledgeKey": "bg:съм:AUX"
            },
            {
              "start": 7,
              "end": 18,
              "surface": "дружелюбно",
              "gloss": "freundlich",
              "lemma": "дружелюбен",
              "partOfSpeech": "ADJ",
              "knowledgeKey": "bg:дружелюбен:ADJ"
            },
            {
              "start": 19,
              "end": 23,
              "surface": "куче",
              "gloss": "Hund",
              "lemma": "куче",
              "partOfSpeech": "NOUN",
              "knowledgeKey": "bg:куче:NOUN"
            }
          ]
        }
      ]
    }
  ]
}
```

`source` enthält den exakten Originalsatz. Die Zeichenpositionen `start` und `end` verknüpfen Einheiten mit dem Original, ohne Leerzeichen oder Satzzeichen künstlich an Wörter hängen zu müssen.

### Optionale morphologische Analyse

Eine Wortform kann später in Morpheme zerlegt werden:

```json
{
  "surface": "градината",
  "gloss": "der Garten",
  "lemma": "градина",
  "knowledgeKey": "bg:градина:NOUN",
  "morphemes": [
    {
      "surface": "градина",
      "gloss": "Garten"
    },
    {
      "surface": "та",
      "gloss": "der"
    }
  ]
}
```

Die normale Ansicht kann weiterhin nur `градината → der Garten` darstellen. Eine Detailansicht könnte zusätzlich `градина | та → Garten | der` zeigen.

## Audio

Jeder Satz kann eine eigene Audiodatei besitzen:

```json
{
  "audio": {
    "file": "audio/s001.mp3",
    "durationMs": 2840,
    "speaker": "female-01"
  }
}
```

Optional können Wortzeiten ergänzt werden:

```json
{
  "audio": {
    "file": "audio/s001.mp3",
    "durationMs": 2840,
    "timings": [
      {
        "unit": 0,
        "startMs": 0,
        "endMs": 510
      },
      {
        "unit": 1,
        "startMs": 540,
        "endMs": 730
      }
    ]
  }
}
```

Damit kann die Anwendung:

- Wörter während der Wiedergabe hervorheben;
- einen Satz ab einer bestimmten Stelle abspielen;
- einzelne Wörter oder Einheiten wiederholen.

Wortzeiten bleiben optional. Ein einfaches Paket benötigt nur eine Audiodatei pro Satz.

### TTS-Strategie

Die Verpackungsanwendung erzeugt Audio einmalig und legt es im Paket ab. Das Obsidian-Plugin spielt ausschließlich die lokalen Dateien ab. Dadurch entstehen beim Lesen keine laufenden API-Kosten und die Texte funktionieren offline.

Für Bulgarisch erscheinen derzeit sinnvoll:

1. Google Chirp 3 HD als Kompromiss aus Qualität, Stimmenauswahl und Preis;
2. Google Standard-B als besonders günstige Option;
3. ElevenLabs Flash als Qualitätsvergleich;
4. Azure Neural als gut steuerbarer Fallback.

Deepgram ist preislich attraktiv, unterstützt zum Zeitpunkt der Konzeption jedoch kein bulgarisches Text-to-Speech.

Die Verpackungsanwendung sollte TTS-Anbieter über austauschbare Adapter anbinden. Ein Textpaket selbst darf nicht vom verwendeten Anbieter abhängen.

## Persönliches Wissensmodell

Der Status wird nicht in Textpaketen gespeichert, sondern in einem eigenen nutzerspezifischen Datenspeicher:

```json
{
  "schemaVersion": 1,
  "words": {
    "bg:съм:AUX": {
      "status": "known",
      "updatedAt": "2026-09-14T18:30:00Z",
      "encounters": 17
    },
    "bg:куче:NOUN": {
      "status": "learning",
      "updatedAt": "2026-09-14T18:31:00Z",
      "encounters": 4
    }
  }
}
```

Mögliche zusätzliche Felder:

- Zeitpunkt der ersten und letzten Begegnung;
- Anzahl der gelesenen Vorkommen;
- manuelle Notizen;
- Aufnahme in die Lernkartei;
- SRS-Fälligkeit und Wiederholungsverlauf;
- bevorzugte oder problematische grammatische Formen.

Der Wissensspeicher bleibt bestehen, wenn Lernpakete aktualisiert oder gelöscht werden.

## Obsidian-Integration

Eine Markdown-Notiz kann auf ein Lernpaket im Vault verweisen:

````markdown
---
interlinear-package: Lerntexte/dog-cat-bg/package.json
---

```interlinear
package: Lerntexte/dog-cat-bg/package.json
```
````

Das Plugin registriert einen Renderer für den Codeblock `interlinear` und lädt das Paket relativ zur aktuellen Notiz.

Vorteile:

- Ein Paket kann in mehreren Notizen verwendet werden.
- Eine Notiz kann mehrere Lerntexte enthalten.
- Gewöhnliche Obsidian-Inhalte können zwischen den Texten stehen.
- Obsidian-Links und Tags können Lerntexte thematisch organisieren.
- Pakete und Audio bleiben normale Dateien im Vault.

## Verpackungsanwendung

Die separate Verpackungsanwendung soll beliebige Texte in Lernpakete verwandeln.

Ihre Verarbeitungsschritte:

1. Text importieren und Sprache bestimmen.
2. Absätze und Sätze segmentieren.
3. Wörter und Satzzeichen mit stabilen Zeichenpositionen erfassen.
4. Grundformen und Wortarten bestimmen.
5. möglichst flache deutsche Wortglossen erzeugen.
6. eine natürliche deutsche Satzübersetzung erzeugen.
7. paketübergreifende `knowledgeKey`-Werte zuweisen oder mit einem Lexikon abgleichen.
8. optional Audio für jeden Satz erzeugen.
9. Paket validieren und exportieren.

Vor dem Export sollte die Anwendung insbesondere prüfen:

- Stimmen Originalsatz und Zeichenpositionen überein?
- Besitzt jede Lerneinheit eine Glosse?
- Besitzt jeder Satz eine flüssige Übersetzung?
- Sind Absatz- und Satz-IDs eindeutig?
- Sind alle Audioverweise gültig?
- Werden identische Lexeme konsistent verschlüsselt?
- Bleiben Artikel, Hilfsverben, Partikeln und andere grammatische Informationen in wDE sichtbar?

## Architekturprinzipien

1. **Inhalt und Lernzustand trennen.**
2. **Originaltexte unverändert bewahren.**
3. **wDE zeigt Struktur; fDE zeigt Bedeutung.**
4. **Wortidentität ist sprach- und bedeutungsspezifisch.**
5. **Textpakete bleiben offen, portabel und versionsfähig.**
6. **Audio wird vorab erzeugt und lokal gespeichert.**
7. **Externe Dienste werden über austauschbare Adapter angebunden.**
8. **Das System muss ohne Netzwerk lesen und lernen können.**

## Empfohlener MVP

### Verpackungsanwendung

- Textimport;
- Satz- und Wortsegmentierung;
- manuell korrigierbare Wortglossen;
- flüssige Übersetzung;
- Grundform und Wortart;
- stabile Wissensschlüssel;
- TTS-Audio pro Satz;
- Export als Paketordner oder ZIP-Datei;
- Schema- und Dateivalidierung.

### Obsidian-Plugin

- Rendering der drei Ebenen;
- einfache Wiedergabe des Satz-Audios;
- vier globale Wortstatus;
- Ausblenden der wDE-Glosse im Status `known`;
- dauerhafte Speicherung über Texte hinweg;
- Ansicht aller Vorkommen eines Wortes;
- Import und Aktualisierung von Textpaketen.

### Spätere Ausbaustufen

- Spaced-Repetition-System;
- Lernkarten mit vollständigen Satzkontexten;
- lemma- und formspezifische Wissensstände;
- morphologische Detailansicht;
- Audio-Timing und Wort-Hervorhebung;
- Satz- und Wortsuche über alle Pakete;
- Mehrwortausdrücke als zusätzliche Wissenseinheiten;
- Statistiken zu Textabdeckung und Lesefortschritt;
- Paketeditor für manuelle sprachliche Korrekturen.

## Offene Entscheidungen

- endgültiger Produktname;
- genaue Bedeutung der vier Lernstatus;
- Status primär pro Lemma, Wortform oder Bedeutung;
- Speicherort des Wissensmodells innerhalb des Obsidian-Vaults;
- Regeln zur Zusammenführung von Wissensschlüsseln aus verschiedenen Paketquellen;
- bevorzugtes Audioformat;
- TTS-Anbieter und Standardstimme je Sprache;
- Lizenzmodell und Austauschformat für Lernpakete.

