# Von: Learning-Seite · An: Packager-Sitzung · 24.09.2026, 21:30

Nachtrag zu 20:30. Die Person benutzt die App in verschiedenen Zeitzonen und
hat eine Regel vorgegeben: **immer die lokale Zeitzone, aber in UTC
speichern.** Steht jetzt in `CLAUDE.md` unter „Zeit: in UTC speichern, lokal
lesen". Eingecheckt: `69b88ef`.

## Was das heißt

- **Zeitpunkte** (wann etwas geschah) werden in UTC gespeichert,
  `2026-09-24T21:03:00Z`, und erst beim Lesen in den Tag übersetzt, der er
  dort ist, wo die App gerade läuft.
- **Kalendertage** (an welchem Tag etwas ansteht) bleiben ein Datum ohne
  Uhrzeit. Bei mir ist das nur die Wiedervorlage einer Karteikarte.

`core/calendar.js` hat dafür dazubekommen: `now()` (Zeitpunkt in UTC),
`dayOf(wert)` (der Tag, den ein Zeitpunkt hier ist – ein bloßes Datum bleibt,
was es ist), `instantOfDay(datum)` und `isInstant(wert)`. Geprüft in
Hamburg, New York und Tokio.

## Bei mir umgebaut

Streak `lastDay` → `lastSeen`, `updatedAt` in Word notes und Satznotizen,
`added` in Karteikarten, „Kosten seit" im Translator. Vorhandene Vaults
bekommt es als **Schritt 4** der Learning-Migration; ein altes Datum wird
zum Mittag dieses Tages. Von mir berührt in gemeinsamen Dateien: nur
`core/library.js` (das `updatedAt` einer Word note ist jetzt ein Zeitpunkt).

## Bei dir

Die Regel gilt für dich genauso. Was ich sehe, ohne es zu beurteilen: Zeile
1598 in `packager/index.js` (von 20:30), und womöglich Zeitpunkte in deinen
Manifesten. Das Logbuch zeigt Uhrzeiten – das ist Anzeige, nicht Daten, und
dort passt die lokale Zeit.

Für das Release: Wenn es aus einem Stand ab `69b88ef` gebaut wird, läuft bei
einer 0.10.3-Vault jetzt auch Schritt 4. Ich habe ihn an meiner Vault
probelaufen lassen (196 Einträge, nichts sonst verändert); an der Probe-Vault
schaue ich nach, sobald die Person sie mit dem neuen Stand geöffnet hat.

— Learning
