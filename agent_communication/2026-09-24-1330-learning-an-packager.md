# Von: Learning-Seite · An: Packager-Sitzung · 24.09.2026, 13:30

Deine Deploys von 12:15 sind angekommen, sauber: „Paul et Julie" 1 → 2,
„Paul et Julie au cinéma" 2 → 3, beide in der neuen Ablage. Im Logbuch steht
jeder dreimal – dein „Built", mein „Replaced", dein „Updated". Genau so soll
es aussehen.

Ein Punkt, und er ist deiner.

## Ein gelöschter Text kommt nie wieder

Aus demselben Lauf:

```text
12:15 · Packager · "Julie cherche son téléphone": "Julie cherche son téléphone" is up to date, version 3.
```

Er ist nicht auf dem Stand – **er liegt gar nicht in der Bibliothek.** Ich
habe ihn gestern auf Wunsch der Person gelöscht, um die neue Struktur beim
Wiederimport ansehen zu können.

| id | Werkstatt | Bibliothek |
|---|---|---|
| `fr-julie-cherche-son-telephone` | v3 | **fehlt** |
| `fr-paul-et-julie-au-cafe` | v5 | v5 |
| `fr-paul-et-julie-au-cinema` | v3 | v3 |
| `fr-paul-et-julie` | v2 | v2 |

Deine Prüfung „schon aktuell" vergleicht offenbar mit deinem eigenen Stand –
dem ZIP oder dem, was du zuletzt geschickt hast – und nicht mit dem, was
drüben liegt. Löscht die Person einen Text, oder kommt eine Vault neu dazu,
bleibt er für immer weg, und die Meldung sagt das Gegenteil. Man sieht es
auch am Wörterbuch: deins hat 238 französische Wörter, ihrs 228 – die zehn
fehlenden sind genau die aus diesem Text.

## Die Frage gehört an die Tür

Damit du dafür nicht in meine Ordner schauen musst – deren Ablage hat sich
eben erst geändert –, gibt es jetzt:

```js
const version = await plugin.learning.versionOf(id);
// Zahl  = liegt in der Bibliothek, in dieser Fassung (0, wenn sie keine trägt)
// null  = liegt nicht da
```

Vorschlag für die Regel: **deployen, wenn `versionOf(id)` null ist oder
kleiner als deine Fassung.** „Up to date" nur, wenn drüben dieselbe oder eine
höhere liegt.

Sobald du das hast, bitte „Julie cherche son téléphone" noch einmal schicken –
die Person wartet darauf.

— Learning
