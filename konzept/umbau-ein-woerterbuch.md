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

**Das ZIP ist zugleich das Gedächtnis.** Wer einen Absatz ändert, muss nicht
alles neu bezahlen: Was im alten ZIP steht, gilt weiter, solange der Satz
derselbe ist – das gilt für die Übersetzung wie für die Tonspur, die ohnehin
am Wortlaut des Satzes hängt. Deshalb kostet es nichts, alles andere
wegzuräumen.

## Die Schemaversion am Eintrag

Jeder Wörterbucheintrag trägt, nach welchem Bauplan er entstanden ist. Daran
– und nur daran – entscheidet der Import, ob er einen vorhandenen Eintrag
ersetzt: **Eine höhere Schemaversion gewinnt, eine gleiche oder niedrigere
lässt liegen.**

Das ist die Antwort auf die Frage, die bisher keine hatte. „Nie
überschreiben" friert die schlechteste Fassung ein, die man je hatte.
„Immer überschreiben" macht jedes alte Paket gefährlich. So wird das
Wörterbuch besser, sobald ein Paket etwas Besseres mitbringt, und sonst
nicht.

## Die Seite der Lernenden danach

```text
learning/FR/
├── language.md
├── dictionary.json       das Wörterbuch: alles, was je importiert wurde
├── dictionary/           Notizen – nur zu Wörtern, mit denen sie sich befasst
├── packages/<Titel>/     package.json (Kopf), text.json, audio/
├── flashcards/
└── sentences/
```

Beim Import wird das ZIP ausgepackt, `dictionary.json` in das zentrale
Wörterbuch eingearbeitet und **fällt weg**. Im Paketordner bleiben der
strukturierte Text und die Tonspuren. Das ZIP selbst wird nicht aufgehoben.

**Gelesen wird ab dann ausschließlich aus dem zentralen Wörterbuch.** Ein
Wort, eine Erklärung – im Text, auf der Wortkarte, auf der Karteikarte.

**Die Notiz ist eine Notiz.** Lernstand, eigene Gedanken, Verweise. Sie nennt
ihren Schlüssel und sonst nichts aus dem Wörterbuch. Das gilt heute schon und
bleibt.

**Die Karteikarte führt ihren eigenen Zustand.** Level und Wiedervorlage
gehören ihr. Vorder- und Rückseite holt sie sich über den Schlüssel aus dem
Wörterbuch, statt sie beim Anlegen abzuschreiben – heute friert eine Karte
die Bedeutung von damals ein, und kein besseres Paket taut sie wieder auf.

## Offen

- **Notiz für jedes importierte Wort oder nur für angefasste?** Vorschlag:
  nur für angefasste, wie heute. Eine Notiz ohne Lernstand und ohne eigenen
  Text sagt nichts, und zweitausend davon verstopfen Suche und Graph. Das
  vollständige Verzeichnis ist das Wörterbuch.
- **Was wird aus Einträgen, deren Paket gelöscht wird?** Vorschlag: Sie
  bleiben. Es ist ihr Wörterbuch, nicht das des Textes.
- **Bestehende Vaults.** Es gibt Pakete im alten Format auf fremden Rechnern.
  Der Umbau muss sie beim Start einsammeln: Wörterbuch aufbauen, Paketordner
  umschreiben, Karteikarten von ihrer eingefrorenen Rückseite lösen.
