# Worterklärungen in der Bibliothek nachführen

Was die Person auf einer Wortkarte liest, kommt aus dem Paket: im
`package.json` eines Lerntextes steht unter `dictionary` je Schlüssel ein
Eintrag mit Bedeutung, Formen und Beschreibung. Der Packager hat ihn dort
hineingeschrieben – und zwar so, wie er es zum Zeitpunkt des Verpackens
konnte.

Ältere Pakete tragen deshalb Beschreibungen aus einer Zeit vor dem Bauplan:
mal eine Konjugation, mal eine Bemerkung, mal beides. Dieser Auftrag führt
sie nach, **in der Vault der Lernenden**, mit Claudian oder einem anderen
Agenten. Den Bauplan holt er sich einmalig aus dem Repo.

Nichts wird dabei neu verpackt und nichts wird neu deployt. Die Pakete
liegen schon da, wo sie hingehören; geändert wird nur, was in ihnen steht.

Die Sprache steht nur in der ersten Zeile. Alles Weitere bezieht sich darauf,
damit beim Kopieren nichts übrig bleibt, was nicht passt.

---

## Der Auftrag zum Kopieren

```text
Führe die Worterklärungen in den Lernpaketen einer Sprache nach.

SPRACHE: FR

Unten steht <SPRACHE> für dieses Kürzel groß und <sprache> für dasselbe klein.

Du änderst ausschließlich das Feld "dictionary" in den Dateien
Trisent/learning/<SPRACHE>/packages/*/package.json - beliebig tief.

Nicht angefasst wird:
- Trisent/learning/<SPRACHE>/dictionary/ - das sind die eigenen Notizen der
  Person, ihr Lernstand. Sie gehören ihr, nicht dem Paket.
- flashcards/, sentences/, language.md
- Trisent/packager/, falls es das hier überhaupt gibt
- in den package.json alles außer "dictionary": paragraphs, sentences, units,
  Zeitmarken, id, version, title, die Sprachfelder. Zeichen für Zeichen.

SCHRITT 1 - Den Bauplan besorgen

Hole ihn hier:
https://raw.githubusercontent.com/ralfw-vibe-coding-obsidian/Trisent/main/schemas/word-notes/<sprache>.md
Gibt es die Sprache dort nicht, nimm default.md aus demselben Ordner.

Dazu die Hausregeln, damit du die Schlüssel verstehst:
https://raw.githubusercontent.com/ralfw-vibe-coding-obsidian/Trisent/main/schemas/rules/<sprache>.md

Leg beides nicht in der Vault ab - du brauchst es nur für diesen Lauf.

Der Bauplan ist der eigentliche Auftrag. Er sagt je Wortart, was in einer
Beschreibung stehen muss, in welcher Form - und was nicht hineingehört.

SCHRITT 2 - Alle Einträge einsammeln

Geh alle package.json der Sprache durch und sammle die Einträge aus
"dictionary" nach ihrem Schlüssel ein.

Derselbe Schlüssel kommt in mehreren Paketen vor. Er bekommt überall
dieselbe Beschreibung - sonst wird dasselbe Wort der Person je nach Text
anders erklärt.

SCHRITT 3 - Beschreiben

Je Schlüssel eine neue Beschreibung: das Feld "grammar", nach dem Bauplan,
auf Deutsch, in der Form, die dort für genau diese Wortart steht - nicht in
einer Mischung aus mehreren. Markdown ist erlaubt.

UNVERÄNDERT BLEIBEN:
- der Schlüssel selbst. An ihm hängt der Lernstand der Person. Ein Eintrag
  unter einem neuen Schlüssel wäre schlimmer als eine veraltete Beschreibung:
  Er sieht richtig aus und trägt den Lernstand ins Leere. Scheint dir eine
  Grundform falsch, lässt du sie trotzdem stehen.
- "lemma" und "partOfSpeech" - aus ihnen ist der Schlüssel entstanden.
- "gloss" - die Bedeutung. Nur ergänzen, wenn sie fehlt.
- "forms" - und zwar je Paket einzeln. Dort stehen die Formen, die in
  DIESEM Text vorkommen. Sie sind absichtlich verschieden und werden nicht
  vereinheitlicht.

SCHRITT 4 - Zurückschreiben

Trag die neue Beschreibung in jedes Paket ein, das den Schlüssel hat.
Die Datei bleibt gültiges JSON und behält ihr Aussehen: zwei Leerzeichen
Einrückung, ein Zeilenumbruch am Ende.

SCHRITT 5 - Durchhalten

Fang mit einem einzigen Paket an und zeig, wie drei Einträge danach
aussehen. Wenn das passt, arbeite den Rest in Gruppen von etwa zwanzig
Schlüsseln ab, ohne zwischendurch zu fragen. Sag am Ende, wie viele
Schlüssel du neu beschrieben hast, in wie vielen Paketen, und bei welchen
du unsicher warst.
```

---

## Was danach gilt

Die Karten zeigen die neuen Beschreibungen, sobald der Reader das Paket
wieder liest. Lernstand, eigene Notizen, Karteikarten und Lesestelle sind
davon unberührt – sie liegen woanders.

Der Packager bleibt außen vor. Was er künftig verpackt, entsteht ohnehin nach
dem Bauplan; seine alten Notizen in der Werkstatt brauchen dafür nicht
angerührt zu werden.
