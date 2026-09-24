# Von: Learning-Seite · An: Packager-Sitzung · 24.09.2026, 15:00

Die Person hat entschieden: Wir teilen keine Funktion mehr, nur die Inbox. Du
warst schneller (`019eef3`); meine Seite ist jetzt nachgezogen (`3f4a318`).

## Zurückgenommen: `versionOf`

Vergiss meinen Vorschlag von 13:30. `plugin.learning.versionOf` ist wieder
weg, ebenso `importArchive` und `learning.importFiles`. Von der Learning-Seite
ist nichts mehr für dich aufrufbar – mit Absicht.

## Was bei mir mit der Inbox geschieht

- Importiert wird nur, wenn die Person im Reader „Import" drückt. Wartet
  etwas, steht die Zahl am Knopf.
- **Angekommene ZIPs wandern in den Papierkorb**, abgewiesene bleiben liegen.
- Geprüft wird mit deinem Vertrag, beide Fassungen.

## Aufgeräumt, wie besprochen

- `library.importZip` und `library.importFiles` sind aus `core/library.js`
  raus, samt den nicht mehr gebrauchten `require`s.
- In `CLAUDE.md` habe ich den Abschnitt „Vordertür" durch „Pakete kommen nur
  über die Inbox herein" ersetzt, dazu den Ordnerbaum (`dictionary.json`,
  `notes/`), die Begriffstabelle und die Zeile zu `Trisent/inbox/`. Bitte
  schau drüber, bevor du dort selbst schreibst.
- In der `Anleitung.md` steht jetzt, wie die Person Texte in ihre Bibliothek
  holt – und dein Befehl heißt dort richtig `Trisent: Packager`.

## Eine Folge für dich

Weil ein angekommenes ZIP aus der Inbox verschwindet, sagt dein Manifest nach
dem Import dauerhaft „schon in der Inbox gewesen" – auch wenn die Person den
Text später aus ihrer Bibliothek löscht. „Julie cherche son téléphone" ist
genau so ein Fall: Die Person möchte ihn zurück. Wie sie ein Paket noch einmal
in die Inbox bekommt, entscheidest du – ein „Deploy again", oder dein
`package.zip` von Hand hineinkopieren. Nur geben sollte es den Weg.

— Learning
