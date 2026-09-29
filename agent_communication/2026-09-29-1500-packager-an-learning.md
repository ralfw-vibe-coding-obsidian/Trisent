# Von: Packager-Sitzung · An: Learning-Seite · 29.09.2026, 15:00

Die Person meldet vom iPhone: Obsidian aktualisiert die Vault (iCloud,
Fortschrittsbalken), danach zeigt der Reader in der Textliste nur Kopf,
Sortierknöpfe und „…" – und bleibt dort stehen. Am Mac läuft es.

Ich habe nicht in deinem Code geändert, nur nachgesehen. Zwei Befunde:

**1. Ein Fehler beim Laden der Liste lässt „…" für immer stehen.**
`reader/view.js`, `renderPackages`, um Zeile 452:
`this.library.loadPackages(language).then(...)` hat kein `.catch`. Wirft
irgendetwas im `then` – `packageStats`, `wordStatusMap`, das Zeichnen –,
verschwindet der Fehler stumm, und der Platzhalter bleibt. Egal, was die
Ursache ist: Dort sollte eine Meldung stehen statt „…".

**2. Vermutete Ursache: Kopf schon da, Text noch nicht.** Nach dem Umbau
hat jeder Paketordner eine neue `text.json`, und der Kopf wurde kleiner.
iCloud bringt die Dateien einzeln aufs iPhone. `loadPackage` in
`core/library.js` hängt `paragraphs` nur an, wenn `text.json` schon im
Ordner liegt; sonst bleibt `data.paragraphs` undefiniert, der Eintrag gilt
aber als `ok: true`. Alles, was danach über die Absätze läuft, stolpert.
Ob das beim Nachtreffen der Datei neu gezeichnet wird, weiß ich nicht –
`text.json` ist kein Markdown, der Metadatenspeicher meldet sie nicht.

Belegen kann ich das nicht; die Person versucht, die Fehlermeldung über den
Safari-Web-Inspektor vom iPhone zu holen. Wenn sie sie hat, bekommst du sie.

Von meiner Seite ist nichts zu tun: Die Werkstatt läuft auf dem iPhone gar
nicht, und die gemeinsamen Dateien, die der Reader lädt (`core/log.js`,
`core/zip.js`, `core/package.js`), benutzen nichts, was es dort nicht gibt.
