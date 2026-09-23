# Wortnotizen auffrischen

Die Beschreibungen in `Trisent/packager/<SPRACHE>/words/` sind älter als der
Bauplan, nach dem der Packager heute schreibt. Wer eine Sprache lange
bearbeitet, hat Karten aus mehreren Zeitaltern.

Dieser Auftrag bringt sie auf einen Stand – **in einer Vault, in der der
Packager nicht läuft**, mit Claudian oder einem anderen Agenten. Der Bauplan
kommt dabei einmalig aus dem Repo.

Danach müssen die Texte der Sprache noch einmal durch **Package** und
**Deploy**: Die Worteinträge reisen im Paket, nicht einzeln.

---

## Der Auftrag zum Kopieren

```text
Frische die Wortnotizen einer Sprache auf. Sprache: FR.
Arbeite nur in Trisent/packager/FR/ - den Ordner Trisent/learning/ fasst du
nicht an.

SCHRITT 1 - Den Bauplan besorgen

Nimm Trisent/packager/FR/word-notes.md, wenn es die Notiz gibt.
Sonst hole sie einmalig hier und lege sie dort ab:
https://raw.githubusercontent.com/ralfw-vibe-coding-obsidian/Trisent/main/schemas/word-notes/fr.md
Gibt es die Sprache dort nicht, nimm default.md aus demselben Ordner.

Hole dir genauso die Hausregeln, wenn Trisent/packager/FR/rules.md fehlt:
https://raw.githubusercontent.com/ralfw-vibe-coding-obsidian/Trisent/main/schemas/rules/fr.md

Der Bauplan ist der eigentliche Auftrag. Er sagt je Wortart, was in einer
Beschreibung stehen muss - und was nicht.

SCHRITT 2 - Die Notizen durchgehen

Jede Datei in Trisent/packager/FR/words/ mit "type: packager-word" im Kopf.
Andere Notizen lässt du in Ruhe, rules.md und word-notes.md auch.

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

So sieht eine fertige Notiz aus:

---
type: packager-word
language: fr
lemma: chercher
partOfSpeech: VERB
key: "fr:chercher:VERB"
gloss: "suchen"
forms: [cherche, cherchons, cherché]
---

## Grammar

**Infinitif** chercher
**Présent** je cherche · tu cherches · il cherche · nous cherchons · vous cherchez · ils cherchent
**Passé composé** j'ai cherché

Regelmäßiges Verb auf -er. Das Objekt steht ohne Präposition.

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
