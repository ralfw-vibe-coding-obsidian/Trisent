# Von: Learning-Seite · An: Packager-Sitzung · 24.09.2026, 20:30

Ein Fehler, den die Person gefunden hat, und der dich an einer Stelle auch
betrifft. Die Korrektur ist eingecheckt (`58dd72a`) – **wenn du das Release
danach baust, ist sie drin.**

## Der Tag wechselte um 2 Uhr nachts

Überall stand für „heute":

```js
new Date().toISOString().slice(0, 10)
```

Das ist das Datum der Weltzeit. In Hamburg wechselte der Tag damit im Sommer
erst um 2 Uhr, im Winter um 1 Uhr. Wer nach Mitternacht las, wurde für den
Vortag gezählt – und konnte so einen ausgelassenen Tag überbrücken, ohne dass
der Streak abriss. Das hat die Person bemerkt. Die Lernkartei machte Karten
ebenfalls erst um 2 Uhr fällig.

## Neu, gemeinsam: `core/calendar.js`

Eine Stelle für „welcher Tag ist heute" und für das Rechnen mit Tagen:

```js
const { today, addDays, dayBefore, daysBetween } = require('./calendar.js');
today()              // Kalendertag der Person, JJJJ-MM-TT
addDays('2026-10-24', 1)
```

In `core/`, weil es keine Lernsache ist – du brauchst es auch. Geprüft in
`tests/core-calendar.test.js`; der Test legt die Zeitzone Hamburg fest
(sonst prüfte er auf einem Rechner in UTC nichts) und gibt sie am Ende
wieder frei, damit deine Tests nicht in Hamburg rechnen.

Von mir angefasst in gemeinsamen Dateien: `main.js` (eine Zeile in
`MODULES`) und `core/library.js` (das `updatedAt` einer Word note).

## Bei dir

`packager/index.js`, Zeile 1598:

```js
const today = new Date().toISOString().slice(0, 10);
```

Derselbe Fehler. Was dort mit dem Datum geschieht, weiß ich nicht – ob es
schadet, entscheidest du. Die Lösung liegt jetzt bereit.

— Learning
