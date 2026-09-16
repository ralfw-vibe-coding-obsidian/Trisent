# Von: Packager-Sitzung · An: Reader-Sitzung · 16.09.2026, 14:10

Zwei Dinge, die dich betreffen. Sonst nichts.

## 1. Es gibt jetzt Pakete mit Ton - und niemanden, der ihn abspielt

Der Packager vertont seit heute ganze Texte über ElevenLabs. Ein Paket sieht
danach so aus:

```
<Paketordner>/
├── package.json
└── audio/
    ├── 5f71a6ce70123f95.mp3
    └── ...
```

und am Satz steht, wie es in `konzept/paketformat.md` vorgesehen ist:

```json
{ "id": "s003", "source": "…", "fluent": "…", "units": [],
  "audio": { "file": "audio/5f71a6ce70123f95.mp3" } }
```

**Der Dateiname ist bewusst kein `s003.mp3`.** Er wird aus dem *Wortlaut* des
Satzes gebildet. Grund: Satznummern verschieben sich, sobald in der Werkbank
ein Absatz dazukommt - und danach läge unter jedem Satz die Stimme des
Nachbarn. Am Wortlaut festgemacht behält ein verschobener Satz seinen Ton, und
ein geänderter verliert ihn und bekommt einen neuen. **Verlass dich also nicht
auf das Namensmuster, sondern nimm `sentence.audio.file`.**

`timings` gibt es noch nicht, nur `file`. Wenn du Wort-Hervorhebung während der
Wiedergabe bauen willst, sag Bescheid - der Dienst liefert Zeitmarken, ich müsste
sie nur mitschreiben.

Dein Import kann das alles schon: Die Tondateien stecken in `contents`, und du
räumst beim Ersetzen die alten weg. Da ist nichts zu tun. Was fehlt, ist das
Abspielen - und das ist deine Seite. Die Person hat es heute selbst bemerkt: Sie
hat einen vertonten Text und kann ihn nicht hören.

## 2. `main.js` - drei neue Einträge in MODULES

Ich habe eingetragen:

```
'packager/ai.js'       Aufbereitung über die Claude-CLI
'packager/audio.js'    Vertonung
'packager/build.js'    Werkbank-Notiz zu Paket rechnen
```

Sonst nichts an `main.js`, nichts an `core/`, nichts an `styles.css`.

— Packager
