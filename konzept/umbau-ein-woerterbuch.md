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
- **Deploy** – das Paket als ZIP in `Trisent/inbox/` legen. Von dort holt die
  Person es ab: zum Weitergeben oder zum Import in ihre Bibliothek. Mit der
  Bibliothek selbst hat die Werkstatt nichts zu tun.

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

**Das Manifest entscheidet.** Neben dem ZIP liegt `manifest.json`: je Datei,
aus der das Paket entstand, ein Fingerabdruck – Ausgangstext, Werkbank, jede
Tonspur –, dazu, welche Fassung schon in die Inbox ging. Weicht eine Datei
davon ab, ist das ZIP verbraucht und Ingest wird wieder anklickbar; Record und
Deploy nicht. Fingerabdrücke statt Uhrzeiten, weil sich ein Datum beim Klonen
oder Synchronisieren ändert, ohne dass sich etwas geändert hat.

In der Werkstatt heißt es immer `package.zip`; einen sprechenden Namen
bekommt erst die Kopie, die hinausgeht - beim Deploy und beim Export.

**Das ZIP ist zugleich das Gedächtnis.** Wer einen Absatz ändert, muss nicht
alles neu bezahlen: Was im alten ZIP steht, gilt weiter, solange der Satz
derselbe ist – das gilt für die Übersetzung wie für die Tonspur, die ohnehin
am Wortlaut des Satzes hängt. Deshalb kostet es nichts, alles andere
wegzuräumen.

## Die Schemaversion am Eintrag

Der Bauplan `meta/schema.md` trägt eine Nummer. Jeder Eintrag merkt sich in
`entrySchema`, mit welcher Nummer er geschrieben wurde - der Name hält sie
auseinander von `schemaVersion`, der Fassung des Paketformats. Wird der Bauplan besser, steigt die
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
    ├── package.zip       das Erzeugnis
    └── manifest.json     woraus es gebaut wurde, und ob es schon in der Inbox war
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

Nicht am Dateinamen. Das Wörterbuch braucht ohnehin keinen: Es ist eine
Datei, in der der Schlüssel danebensteht. Dateinamen gibt es nur noch für
Notizen und Karteikarten, und dort ist der Name eine Beschriftung für die
Person - der Schlüssel steht im Kopf.

### Gleich geschrieben, nicht dasselbe Wort

Zwei Fälle, die leicht durcheinandergehen.

**Gleiches Lemma, verschiedene Wortart** - `après` als Präposition und als
Adverb, `ce` als Artikelwort und als Pronomen. Das sind zwei Schlüssel und
zwei Einträge; im Wörterbuch stehen sie ohne Weiteres nebeneinander. Eng wird
es nur, wenn beide eine Notiz oder eine Karteikarte bekommen - dann trägt die
zweite Datei einen Zusatz: `après.md` und `après (ADV).md`. Kein Problem,
weil die Wahrheit im Kopf der Notiz steht und nicht im Namen.

**Gleiches Lemma, gleiche Wortart** - `le tour` (der Rundgang) und `la tour`
(der Turm), `le livre` (das Buch) und `la livre` (das Pfund). Hier hilft kein
Dateiname: **Der Schlüssel selbst kann die beiden nicht unterscheiden.**

Dabei bleibt es. Der Schlüssel muss sich mechanisch aus Grundform und
Wortart ergeben - überall, von jedem, auch in einem Jahr. Sobald er eine
Entscheidung enthielte ("ist das Bedeutung 1 oder 2?"), würden zwei
Werkstätten sie verschieden treffen, und der Lernstand der Person zerfiele in
zwei Hälften. Genau davor soll der Schlüssel schützen. Ein Paket von einem
Fremden muss denselben Schlüssel bilden wie das eigene.

Also: **ein Eintrag, der beide Bedeutungen nennt** - und das, woran man sie
auseinanderhält. Im Französischen ist es der Artikel, und der gehört ohnehin
in die Beschreibung eines Substantivs. Für die Lernende ist das eher ein
Gewinn: `le tour` und `la tour` nebeneinander zu sehen ist genau das, was man
wissen muss.

Der Preis ist ehrlich zu nennen: Beide teilen sich einen Lernstand und eine
Karteikarte. Wer den Turm kennt, gilt auch beim Rundgang als kundig.

Im Bauplan einer Sprache sollte stehen, wie so ein Eintrag aussieht.

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
