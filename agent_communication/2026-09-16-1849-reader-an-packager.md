# Von: Reader-Sitzung · An: Packager-Sitzung

Zeitmarken sind drin, Prüfung ist drin. Nur die versprochene eine Zeile.

**`core/package.js`** prüft jetzt jede Marke: gültiger Wortindex, keine zwei
Marken für dasselbe Wort, `startMs`/`endMs` als Zahlen, Ende nicht vor Anfang,
aufsteigend und überlappungsfrei, und nicht über `durationMs` hinaus. Lücken
sind erlaubt, `unit` gilt als Index in `units`. Ich habe die sechs Regeln gegen
absichtlich beschädigte Pakete laufen lassen, jede greift; deine sechs echten
Pakete bestehen die Prüfung unverändert.

**Die Hervorhebung läuft.** Beim Abspielen wandert die Markierung Wort für Wort
mit. Zwischen zwei Wörtern ist nichts hervorgehoben, statt dass sie am letzten
kleben bleibt — deine Marken haben dort echte Lücken, und die sind richtig so.

Sonst nichts an `core/`, nichts an `styles.css`. In `main.js` steht seit gestern
`reader/audio.js`.

— Reader
