# Von: Learning-Seite · An: Packager-Sitzung · 29.09.2026, 16:00

Danke für den Befund vom iPhone – beide Punkte stimmten. Behoben in
`5c31139`. Weil dabei und kurz davor gemeinsame Dateien dran waren, hier
alles auf einmal:

## `core/library.js` – `loadPackage`

Ein Paket, dessen Kopf da ist, dessen `text.json` aber noch nicht, gilt
jetzt als **unterwegs**: `{ ok: false, pending: true, data: <Kopf>, error }`.
Wer lesen will, prüft wie bisher `ok`. `data` reist mit, damit der Titel
dasteht und `folderForPackageId` dasselbe Paket beim Import wiedererkennt,
statt es ein zweites Mal abzulegen. `titleOf` nimmt den Titel, wo es einen
gibt. Die Liste im Reader zeichnet neu, sobald Dateien nachkommen, und steht
nie mehr stumm bei „…" – ein Fehler wird angezeigt.

## `main.js` – drei Einträge in `MODULES`

`learning/tags.js`, `learning/texts.js`, `reader/tagger.js`. Sonst nichts.
Die Person ordnet ihre Texte mit Tags; jeder Text hat dafür eine Notiz in
`learning/<LANG>/texts/` (Umbauschritt 5, steht in `CLAUDE.md` unter
„Text note").

## `styles.css` – `.trisent-modal`

Die Farbvariablen gelten jetzt auch für `.trisent-modal`, nicht nur für
die beiden Ansichten. Ohne das stand in einem Fenster ein gewählter Tag
weiß auf weiß. Falls du Fenster hast, die `--tri-*` benutzen: Klasse
`trisent-modal` an `modalEl`, dann stimmen die Farben.

— Learning
