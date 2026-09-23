# Ein Wörterbuch, ein Erzeugnis

Ein Vorhaben. Noch nichts davon ist gebaut.

## Woran es heute hakt

Jedes Paket bringt seine Worterklärungen mit. Das muss so sein – ein Paket
soll für sich stehen, auch in einer fremden Vault. Aber beim Import wird
nichts davon zusammengeführt: Das Wissen bleibt in den Paketen liegen, so
oft, wie das Wort in Texten vorkommt. In der Bibliothek hier stehen 282
verschiedene Schlüssel, 65 davon in mehr als einem Paket.

Solange alle Pakete aus derselben Werkstatt stammen, fällt das nicht auf.
Ändert sich der Bauplan, zerfällt es: Derselbe Schlüssel wird im alten Text
anders erklärt als im neuen. Und die Wortkarte hat heute schon zwei Wege zur
Erklärung – aus dem Text heraus gilt das gerade gelesene Paket, aus der
Wortnotiz heraus das alphabetisch erste, das den Schlüssel kennt. Zwei Wege,
zwei Antworten.

Die Werkstatt hat das Problem nicht. Dort gibt es seit jeher **einen**
Wortvorrat je Sprache, und ein neuer Text lässt nur nachschlagen, was noch
fehlt. Diese Ordnung muss über die Vordertür hinweg erhalten bleiben.

## Drei Knöpfe

Was die Person entscheidet, sind drei Dinge:

- **Ingest** – alles vom Text bis zum fertigen Paket, ohne Ton.
- **Record** – die Sätze vertonen. Das Paket wird ergänzt.
- **Deploy** – das Paket hinüberschieben.

Dahinter liegen die Phasen. Sie sind für die Maschine, nicht für die
Oberfläche: *parse* (in Sätze und Einheiten zerlegen), *compile*
(übersetzen, Lemmata bestimmen), *index* (fehlende Wörterbucheinträge
schreiben), *assemble* (zusammensetzen), *package* (verschnüren).

## Das Paket ist ein ZIP

Es ist das Erzeugnis, und es ist das einzige, das bleiben muss. Alles
Zwischenprodukt darf verschwinden.

```text
paket.zip
├── package.json     Kopf: Kennung, Fassung, Titel, Sprache
├── text.json        Absätze, Sätze, Einheiten, Wendungen, Zeitmarken
├── dictionary.json  ein Eintrag je Schlüssel
└── audio/           eine Datei je Satz
```

Zwei Dinge fallen damit an einer Stelle zusammen:

**Ein Datum entscheidet.** Ist der Ausgangstext jünger als das ZIP, ist das
ZIP verbraucht und Ingest wird wieder anklickbar. Vorher nicht. Kein
Buchführen, kein Vergleichen von Zwischenständen.

In der Werkstatt heißt es immer `package.zip`; einen sprechenden Namen
bekommt erst die Kopie, die hinausgeht - beim Deploy und beim Export.

**Das ZIP ist zugleich das Gedächtnis.** Wer einen Absatz ändert, muss nicht
alles neu bezahlen: Was im alten ZIP steht, gilt weiter, solange der Satz
derselbe ist – das gilt für die Übersetzung wie für die Tonspur, die ohnehin
am Wortlaut des Satzes hängt. Deshalb kostet es nichts, alles andere
wegzuräumen.

## Die Schemaversion am Eintrag

Der Bauplan `meta/schema.md` trägt eine Nummer. Jeder Eintrag merkt sich, mit
welcher Nummer er geschrieben wurde. Wird der Bauplan besser, steigt die
Nummer - zentral, im Repo, für alle.

Sie steht **am einzelnen Eintrag**, nicht am Paket. Das folgt aus der Regel,
dass *index* nur nachschlägt, was fehlt: Ein frisch gebautes Paket enthält
zwangsläufig Einträge aus mehreren Zeitaltern. Daran
– und nur daran – entscheidet der Import, ob er einen vorhandenen Eintrag
ersetzt: **Eine höhere Schemaversion gewinnt, eine gleiche oder niedrigere
lässt liegen.**

Das ist die Antwort auf die Frage, die bisher keine hatte. „Nie
überschreiben" friert die schlechteste Fassung ein, die man je hatte.
„Immer überschreiben" macht jedes alte Paket gefährlich. So wird das
Wörterbuch besser, sobald ein Paket etwas Besseres mitbringt, und sonst
nicht.

## Wo was liegt

### Die Werkstatt

```text
packager/FR/
├── meta/
│   ├── rules.md          Hausregeln: wie aus einer Wortform ein Schlüssel wird
│   └── schema.md         der Bauplan: was in einer Beschreibung steht, je Wortart
├── dictionary.json       DER Wortvorrat - ein Eintrag je Schlüssel, für alle Texte
└── <Titel>/
    ├── text.md           der Ausgangstext. Ohne ihn geht nichts wieder von vorn.
    ├── work.md           die lesbare Werkbank - hier kann von Hand korrigiert werden
    ├── text.json         die Zerlegung
    ├── dictionary.json   die Einträge, die in DIESEM Text vorkommen
    ├── package.json      Kopf
    ├── audio/
    └── package.zip       das Erzeugnis
```

Das eine `dictionary.json` im Sprachordner ist die Ordnung, um die es geht:
*index* schlägt nur nach, was dort fehlt. Das `dictionary.json` im Textordner
ist nur der Auszug daraus, der mitreisen muss.

Alles im Textordner außer `text.md` und dem ZIP ist Zwischenprodukt und darf
verschwinden.

### Die Seite der Lernenden

```text
learning/FR/
├── language.md
├── dictionary.json       das Wörterbuch: alles, was je importiert wurde
├── notes/                Notizen - on demand, nur zu Wörtern, mit denen sie arbeitet
├── flashcards/           nur zu Einträgen, die sie lernen will
├── sentences/            was der Übersetzer je Text festhält
└── packages/<Titel>/
    ├── package.json      Kopf
    ├── text.json
    └── audio/
```

Beim Import wird das ZIP ausgepackt, sein `dictionary.json` mit dem zentralen
abgeglichen und **fällt weg**. Das ZIP selbst wird nicht aufgehoben.

**Gelesen wird ab dann ausschließlich aus dem zentralen Wörterbuch.** Ein
Wort, eine Erklärung - im Text, auf der Wortkarte, auf der Karteikarte.

### Was sie verbindet

Der Schlüssel, `fr:accord:NOUN`. Wörterbucheintrag, Notiz und Karteikarte
hängen an ihm und an nichts anderem.

Nicht am Dateinamen: Doppelpunkte sind in Dateinamen nicht überall erlaubt.
Der Schlüssel steht im Kopf der Notiz. Und weil zwei Einträge dasselbe Lemma
haben können (`être` als VERB und als AUX), braucht der zweite Dateiname
einen Zusatz.

**Die Notiz ist eine Notiz.** Lernstand, eigene Gedanken, Verweise - und der
Schlüssel. Nichts aus dem Wörterbuch wird hineinkopiert.

**Die Karteikarte führt ihren eigenen Zustand.** Level und Wiedervorlage
gehören ihr. Vorder- und Rückseite holt sie sich über den Schlüssel aus dem
Wörterbuch, statt sie beim Anlegen abzuschreiben - heute friert eine Karte
die Bedeutung von damals ein, und kein besseres Paket taut sie wieder auf.

## Offen

- **Der Ton liegt zweimal**, lose im Textordner und im ZIP. Vorschlag: Nach
  dem Verschnüren darf das lose `audio/` weg - Record packt sich aus dem ZIP,
  was es behalten will.
- **Was wird aus Einträgen, deren Paket gelöscht wird?** Vorschlag: Sie
  bleiben. Es ist ihr Wörterbuch, nicht das des Textes.
- **Bestehende Vaults.** Es gibt Pakete im alten Format auf fremden Rechnern.
  Der Umbau muss sie beim Start einsammeln: Wörterbuch aufbauen, Paketordner
  umschreiben, Karteikarten von ihrer eingefrorenen Rückseite lösen.
