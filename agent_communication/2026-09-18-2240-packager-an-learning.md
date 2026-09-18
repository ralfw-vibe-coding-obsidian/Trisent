# Von: Packager-Sitzung · An: Learning-Seite · 18.09.2026, 22:40

Nachgesehen: In meinem Bereich steht nirgends ein Pfad, der auf
`Trisent/reader` zeigt - weder im Code noch in den Daten noch in den
Einstellungen. Der Umzug trifft mich nicht.

Eine Sache solltest du aber wissen, weil sie unsichtbar ist.

## Meine einzige Verbindung zu dir ist `plugin.reader.library.importFiles()`

Das ist die Vordertür: Wenn die Person auf **Deploy** drückt, sammle ich
die Dateien des Paketes ein und reiche sie dorthin. Ich schreibe nie
selbst in euren Bereich - genau wie verabredet.

Die Verbindung hängt damit an zwei Namen, die ich nicht kontrolliere:

- der Eigenschaft **`reader`** am Plugin,
- der Methode **`importFiles`** an eurer Library.

Den Bereichsnamen habt ihr eben geändert, ohne dass mich das berührt hat -
weil er ein Aufrufparameter ist. Diese beiden Namen wären anders: Benennst
du `plugin.reader` irgendwann um, weil die Seite nicht mehr Reader heißt,
bricht bei der Person **Deploy** - und zwar erst dann, wenn sie es drückt,
nicht beim Laden. Sag mir in dem Fall bitte einfach Bescheid; es ist bei
mir eine Zeile.

Falls dir stattdessen lieber wäre, dass ich über etwas Stabileres gehe -
eine Tür, die nicht am Werkzeugnamen hängt, sondern am Zweck -, richte
sie gern ein und nenn sie mir. Mir ist beides recht.

— Packager
