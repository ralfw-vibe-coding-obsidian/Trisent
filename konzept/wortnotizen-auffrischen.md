# Wortnotizen auffrischen

Die Beschreibungen in `Trisent/packager/<SPRACHE>/words/` sind älter als der
Bauplan, nach dem der Packager heute schreibt. Wer eine Sprache lange
bearbeitet, hat Karten aus mehreren Zeitaltern.

Dieser Auftrag bringt sie auf einen Stand – **in einer Vault, in der der
Packager nicht läuft**, mit Claudian oder einem anderen Agenten. Der Bauplan
kommt dabei einmalig aus dem Repo.

Die Sprache steht nur in der ersten Zeile. Alles Weitere bezieht sich darauf,
damit beim Kopieren nichts übrig bleibt, was nicht passt.

Danach müssen die Texte der Sprache noch einmal durch **Package** und
**Deploy**: Die Worteinträge reisen im Paket, nicht einzeln.

---

## Der Auftrag zum Kopieren

```text
Frische die Wortnotizen einer Sprache auf.

SPRACHE: FR

Unten steht <SPRACHE> für dieses Kürzel groß und <sprache> für dasselbe klein.

Arbeite nur in Trisent/packager/<SPRACHE>/ - den Ordner Trisent/learning/
fasst du nicht an.

SCHRITT 1 - Den Bauplan besorgen

Nimm Trisent/packager/<SPRACHE>/word-notes.md, wenn es die Notiz gibt.
Sonst hole sie einmalig hier und lege sie dort ab:
https://raw.githubusercontent.com/ralfw-vibe-coding-obsidian/Trisent/main/schemas/word-notes/<sprache>.md
Gibt es die Sprache dort nicht, nimm default.md aus demselben Ordner.

Hole dir genauso die Hausregeln, wenn Trisent/packager/<SPRACHE>/rules.md fehlt:
https://raw.githubusercontent.com/ralfw-vibe-coding-obsidian/Trisent/main/schemas/rules/<sprache>.md

Der Bauplan ist der eigentliche Auftrag. Er sagt je Wortart, was in einer
Beschreibung stehen muss, in welcher Form - und was nicht hineingehört.

SCHRITT 2 - Die Notizen durchgehen

Jede Datei in Trisent/packager/<SPRACHE>/words/ mit "type: packager-word" im
Kopf. Andere Notizen lässt du in Ruhe, rules.md und word-notes.md auch.

UNVERÄNDERT BLEIBEN, Zeichen für Zeichen:
  type, language, lemma, partOfSpeech, key
Am Schlüssel hängt der Lernstand der Person. Eine Notiz unter einem neuen
Schlüssel wäre schlimmer als eine veraltete: Sie sieht richtig aus und
trägt den Lernstand ins Leere. Scheint dir eine Grundform falsch, lässt du
sie trotzdem stehen und schreibst nichts weiter dazu.

forms: darf wachsen, nie schrumpfen. Was dort steht, stammt aus Texten.

NEU ENTSTEHEN:
  gloss: die Grundbedeutung auf Deutsch, ein bis drei Wörter,
         Alternativen mit Komma. Nicht die Bedeutung aus einem
         bestimmten Satz - die allgemeine.
  Der Abschnitt "## Grammar": die Beschreibung nach dem Bauplan,
         auf Deutsch, in der Form, die dort für diese Wortart steht -
         nicht in einer Mischung aus mehreren.

Andere Abschnitte in der Notiz lässt du stehen, wie sie sind.
Gibt es noch keinen Abschnitt "## Grammar", legst du ihn an.

Eine fertige Notiz sieht so aus:

---
type: packager-word
language: <sprache>
lemma: <unverändert>
partOfSpeech: <unverändert>
key: "<unverändert>"
gloss: "<neu>"
forms: [<unverändert, höchstens ergänzt>]
---

## Grammar

<die Beschreibung nach dem Bauplan für genau diese Wortart>

SCHRITT 3 - Durchhalten

Geh in Gruppen von etwa zwanzig Notizen vor und arbeite alle ab, ohne
zwischendurch zu fragen. Sag am Ende, wie viele du neu geschrieben hast und
bei welchen du unsicher warst.
```

---

## Was danach gilt

Die aufgefrischten Notizen liegen in der Werkstatt. In die Bibliothek der
Person kommen sie erst mit dem nächsten Paket: Für jeden Text der Sprache
einmal **Package**, dann **Deploy**. Das Deployen ist wiederholbar – Lernstand,
eigene Notizen und Lesestelle bleiben unberührt.
