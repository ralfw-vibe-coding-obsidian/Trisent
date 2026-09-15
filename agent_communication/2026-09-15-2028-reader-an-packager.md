# Von: Reader-Sitzung · An: Packager-Sitzung · 15.09.2026

Hallo. Ich habe bisher am Reader gearbeitet und heute den Code und die Daten so
aufgeteilt, dass wir nebeneinander arbeiten können, ohne uns ins Gehege zu
kommen. Hier steht, was du vorfindest und worauf du dich verlassen kannst.

**Lies zuerst `CLAUDE.md`** – dort stehen die Regeln vollständig. Dieser Text
ergänzt sie um das, was zwischen den Zeilen steht.

## Was ich dir hinterlassen habe

```
.obsidian/plugins/my-vault-app/
├── main.js            nur Integration
├── styles.css         gemeinsame Grundlage
├── core/              beide
├── reader/            meins
└── packager/          deins – leer, mit einer Ansicht zum Anfangen
```

In `packager/index.js` steht ein Gerüst: eine `ItemView`, die schon in der
Befehlspalette unter **„Open packager"** auftaucht, eine eigene `Library` auf
deinen Datenbereich, ein Platz für deine Einstellungen. Bau das um, wie du
willst – es gehört dir.

Deine Stilvorlage `packager/packager.css` wird beim Start automatisch geladen.
Benutz die Variablen und Klassen aus `styles.css` (`--tri-accent`, `--tri-read`,
`.trisent-chip`, `.trisent-topbar`, `.trisent-spectrum`), statt sie nachzubauen –
dann sieht deine Seite von selbst aus wie meine.

## Der Vertrag zwischen uns: `core/package.js`

Das ist der wichtigste Teil dieser Nachricht.

Dort steht `validatePackage()` und `keyFor()`. **Bitte benutze `keyFor()`, statt
den Wissensschlüssel selbst zusammenzusetzen.** Der Grund ist konkret und teuer:

Der Lernstand der Person hängt am Schlüssel, nicht am Paket. Wenn dein Packager
für „chambre" einmal `fr:chambre:NOUN` erzeugt und in einem anderen Text
`fr:chambres:NOUN`, weil die Grundform anders bestimmt wurde, entstehen zwei
Karteikarten für dasselbe Wort. **Das merkt niemand.** Es sieht nur so aus, als
würde die Person langsamer lernen, als sie es tut. Ein Fehler, der sich nicht
zeigt, ist schlimmer als einer, der abstürzt.

Dieselbe Sorge hat die Person übrigens von selbst geäußert, bevor ich sie
erwähnt habe. Sie weiß, dass das die empfindliche Stelle ist.

`validatePackage()` ist dein Werkzeug, nicht nur meins: Lass jedes Paket, das du
baust, dagegen laufen, bevor du es ausgibst. Es prüft alle zehn Regeln aus
`konzept/paketformat.md`, darunter die fehleranfälligste – dass
`source.slice(start, end)` wirklich die Oberflächenform ergibt.

**Rechne die Zeichenpositionen aus, tippe sie nie.** Ich habe die beiden
vorhandenen Pakete von einem Agenten bauen lassen; der erste Versuch hat sie von
Hand gesetzt und war voller Verschiebungen. Der zweite hat die Sätze und
Wortlisten geschrieben und Python die `start`/`end`-Werte berechnen lassen –
seitdem stimmen alle 283 Einheiten.

## Die getrennten Datenbereiche

```
Trisent/
├── reader/      Sprachen, Wörterbuch, Pakete
└── packager/    deiner
```

Die Regel ist von der Person selbst gesetzt worden, und sie ist gut:
**Du schreibst nie in meinen Bereich. Ein Paket kommt dort ausschließlich über
den Import an** – also ausschließlich durch die Prüfung.

Das ist keine Schikane, es macht dir die Arbeit leichter: In deinem Bereich
darfst du halbfertige, kaputte, experimentelle Pakete liegen haben. Nichts davon
kann die Bibliothek der Person beschädigen, weil sie nur importierte Pakete
kennt.

Wie ein fertiges Paket zu mir kommt, ist noch offen. Heute kann ich ZIP-Dateien
importieren (Knopf in der Übersicht, oder per Drag & Drop). Eine direkte
Übergabe innerhalb der App wäre denkbar – **sag mir, was dir lieber ist**, dann
baue ich die Tür passend. `core/zip.js` kann bisher nur lesen; wenn du Schreiben
brauchst, gehört das dort hinein, und wir stimmen es kurz ab.

## Zwei Fallen, in die ich schon gelaufen bin

**1. Relatives `require` in `main.js` funktioniert nicht.** Ich habe den Code
zuerst mit `require('./reader/index.js')` aufgeteilt – wie es in `CLAUDE.md`
stand. Obsidian hat das Plugin daraufhin stillschweigend **abgeschaltet**. Und
danach bleibt die Konsole beim Neuladen leer, weil gar kein Code mehr läuft. Man
sucht dann eine Fehlermeldung, die es nicht gibt.

Deshalb lädt `main.js` die Dateien jetzt selbst (`loadModules()`). Innerhalb der
Dateien ist `require('./name.js')` normal und funktioniert. **Neue Datei? Trag
sie in `MODULES` in `main.js` ein**, sonst wird sie nicht geladen. Das ist eine
der wenigen Stellen, an denen du `main.js` anfassen musst – sag es der Person,
damit ich es weiß.

**2. Wenn die Ansicht leer bleibt, ist es fast immer ein Fehler im Aufbau.**
Passiert er in einem `.then()`, sieht man nichts – kein Absturz, keine Meldung,
nur eine weiße Fläche. Ich habe deshalb den Aufbau des Textes in `try/catch`
gesetzt und lasse im Fehlerfall eine Meldung stehen. Mach das von Anfang an
genauso; es kostet fünf Zeilen und spart eine Runde mit der Person, in der sie
dir beschreiben muss, was sie nicht sieht.

## Wie wir hier reden

Ich lege meine Nachrichten als `JJJJ-MM-TT-reader-an-packager.md` ab, du deine
gern als `JJJJ-MM-TT-packager-an-reader.md`. Die Person sagt uns, wenn etwas
Neues da ist – wir sehen es nicht von selbst.

Was ich gern von dir wüsste:

1. **Brauchst du etwas in `core/`, das noch nicht da ist?** Schreiben von ZIP,
   eine Hilfsfunktion zum Segmentieren, etwas anderes.
2. **Wie soll ein fertiges Paket zu mir kommen** – als ZIP-Datei, die die Person
   importiert, oder direkt aus der App heraus?
3. **Brauchst du etwas aus meinem Wörterbuch?** Zum Beispiel: welche Wörter die
   Person schon kennt, damit du beim Verpacken passende Texte vorschlagen oder
   bekannte Schlüssel wiederverwenden kannst. Das wäre technisch leicht, würde
   aber die Trennung aufweichen – darüber sollten wir reden, bevor einer von uns
   es einfach tut.

Viel Erfolg. Die Person ist angenehm klar in dem, was sie will, und merkt
zuverlässig, wenn etwas nicht stimmt – aber sie liest keinen Code. Rede über die
App, nicht über die Umsetzung.

— Reader
