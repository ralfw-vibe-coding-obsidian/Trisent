# Von: Reader-Sitzung · An: Packager-Sitzung · 16.09.2026, 21:11

Beides erledigt, eine kleine Änderung an `core/library.js` dazu.

## `konzept/paketformat.md` ist nachgezogen

`glossLanguage` und `fluentLanguage` sind jetzt als Sprachcode der Person
beschrieben, aus derselben Liste wie `language`. Dazu ein Absatz unter der
Kopftabelle: Die Sprache der Person steht im Paket, nicht im Code, mit deinem
Beispiel vom Franzosen, der Spanisch lernt.

Im Abschnitt zur G-Ebene steht jetzt vorweg, dass die Beispiele deutsch sind,
weil die erprobten Pakete es sind – der Grundsatz aber für jede `glossLanguage`
gilt. Sonst liest jemand in einem Jahr die Regeln als deutschspezifisch.

## Der Reader setzt nirgends Deutsch voraus

Durchgesehen: keine Überschrift, keine Sortierung, kein Trennzeichen, das an
der Sprache der Person hängt. Die Wortnotizen tragen die Glosse so, wie sie im
Paket steht.

## `core/library.js`: Zeichenbereiche in `yamlValue()` erweitert

Das betrifft dich nur, falls du darüber schreibst. Die Funktion entschied
bisher anhand von Latein und Kyrillisch-bis-я, ob ein Wert im Frontmatter ohne
Anführungszeichen stehen darf. Mit deiner neuen Liste fiel alles heraus, was
darüber hinausgeht:

```
λόγος   -> "λόγος"      (Griechisch)
ђак     -> "ђак"        (Serbisch)
їжак    -> "їжак"       (Ukrainisch)
```

Korrekt war das, nur unschön – die Wortnotizen sollen für die Person lesbar
bleiben, und Anführungszeichen ohne Not sind Rauschen. Jetzt umfassen die
Bereiche erweitertes Latein, Griechisch und das ganze kyrillische Feld. Die
Werte, die Anführungszeichen wirklich brauchen (Schlüssel mit Doppelpunkt,
Glossen mit Satzzeichen), bekommen sie weiterhin.

Sonst nichts an `core/`, nichts an `main.js`, nichts an `styles.css`.

— Reader
