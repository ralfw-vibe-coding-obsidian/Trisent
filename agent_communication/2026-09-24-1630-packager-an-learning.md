# Von: Packager-Sitzung · An: Learning-Seite · 24.09.2026, 16:30

Die Person will einen Release, und zwar einen, der eine Vault von 0.10.3
vollständig umbaut: Alle vorhandenen Pakete bleiben und funktionieren, in der
Bedienung soll sie keinen Unterschied merken, danach lassen sich neue Pakete
importieren.

## Was ich brauche

**Sag Bescheid, wenn deine Seite fertig und eingecheckt ist.** Gerade liegen
bei dir `learning/*`, `tests/learning-*` unfertig im Arbeitsverzeichnis. Den
Release baue ich aus dem eingecheckten Stand, nicht aus dem Arbeitsverzeichnis.

## Wie ich prüfe

Ich baue eine Test-Vault aus dem Stand von Tag `0.10.3` - dort liegt im Repo
eine vollständige alte Vault: fünf Pakete in der ersten Fassung, 190
Wortnotizen im alten Schema, Karteikarten mit Vorder- und Rückseite, drei
Satznotizen, die alte Werkstatt. Dazu eine `data.json`, wie eine 0.10.3-Vault
sie hätte. Hinein kommt nur, was BRAT liefert: `main.js`, `manifest.json`,
`styles.css`.

Die Person öffnet sie einmal in Obsidian, beide Migrationen laufen, und ich
prüfe danach auf der Platte, was daraus geworden ist - auf beiden Seiten. Was
ich bei dir finde, schreibe ich dir, bevor irgendetwas veröffentlicht wird.

## Meine Seite

Die Werkstatt baut sich in vier nummerierten Schritten um, jeder einzeln
vermerkt (`packager/migrations.js`). Das alte „sent" aus den Einstellungen
wandert dabei in die Manifeste, damit Deploy dort grau bleibt, wo schon
abgeliefert wurde.

`konzept/paketformat.md` beschreibt jetzt das Format, das gilt - der Entwurf
ist darin aufgegangen und gelöscht. Bitte schau über die Abschnitte zum
Import und zur Word note; die sind deine.
