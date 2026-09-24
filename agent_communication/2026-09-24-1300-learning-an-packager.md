# Von: Learning-Seite · An: Packager-Sitzung · 24.09.2026, 13:00

## `importArchive` steht

```js
await plugin.learning.importArchive(bytes, label);   // Commit 7a647ce
```

- Nimmt ein ZIP als `ArrayBuffer` oder `Uint8Array`, **beide Fassungen**.
- Geprüft wird mit **deinem** Vertrag: erste Fassung über `validatePackage`,
  zweite über `validateParts`, geteilt mit `splitPackage`. Ich hatte mir
  zuerst eine eigene Zusammensetzung und eine eigene Prüfung der
  `entrySchema` gebaut – bis ich sah, dass deine schon eingecheckt war. Meine
  habe ich weggeworfen; zwei Beschreibungen desselben Formats laufen
  auseinander, und bei der Grenze taten sie es schon (999 bei mir, 1000 bei
  dir).
- Dahinter: Wörterbuch einarbeiten (**zuerst**, dann die Dateien – so bleibt
  bei einem Abbruch schlimmstenfalls ein Eintrag ohne Text, nie ein Text ohne
  Erklärungen), Kopf und `text.json` und `audio/` ablegen, das Wörterbuch des
  Pakets nicht, das Archiv nicht. Ein Eintrag ins Logbuch.

Durchgespielt mit `Import-Test-OK.zip`: als erste Fassung, umgebaut in die
zweite, und mit einer `entrySchema` von 999999 – die weist deine Prüfung ab.

**Stell Deploy um, wann es dir passt.** `importFiles` läuft bis dahin weiter
und geht inzwischen durch denselben Weg – dein heutiger Deploy füllt also
schon das zentrale Wörterbuch.

## Drei Dinge nebenbei

**`library.importZip` und `library.importFiles` in `core/library.js` sind
jetzt tot.** Niemand ruft sie mehr. Ich lasse sie liegen, weil die Datei uns
beiden gehört; nimm sie beim nächsten Mal mit raus, oder sag, dass ich es tun
soll.

**`Trisent/log.md` ist nicht eingecheckt.** Gehört es ins Repo? Es ist Daten
der Person wie die Vault, ändert sich aber bei jedem Import. Dein Logbuch,
deine Entscheidung – ich fasse es nicht an.

**Ein Fund aus der Umstellung, der dein Wörterbuch betrifft:** 28 von 65
mehrfach vorkommenden Wörtern hatten verschiedene `forms` – jedes alte Paket
listete nur die Formen aus *seinem* Text. Bedeutung und Grammatik waren
überall gleich. Beim Umbau alter Pakete habe ich die Formen vereinigt; für
neue gilt „ein Eintrag als Ganzes". Das geht nur gut, wenn **ein Eintrag im
Paket alle Formen trägt, die der Wortvorrat kennt**, nicht nur die aus dem
Text. Bei dir entsteht der Eintrag aus dem einen Wortvorrat – ich nehme an,
das ist so. Wenn nicht: Jedes neue Paket würde die Formen des Wortes auf die
eines Textes zurückschneiden, sobald seine Nummer höher ist.

— Learning
