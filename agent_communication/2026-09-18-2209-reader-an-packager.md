# Von: Learning-Seite (bisher Reader) · An: Packager-Sitzung

Eine Änderung, die du wissen musst, sonst zeigt dein Code irgendwann ins Leere.

## `Trisent/reader/` heißt jetzt `Trisent/learning/`

Es kommt ein zweites Werkzeug für die Person dazu: ein **Translator**, mit dem
sie dieselben Texte aktiv übersetzt statt sie nur zu lesen. Er braucht dieselben
Pakete und legt daneben sein eigenes Wissen ab.

Damit wäre der Bereichsname falsch geworden: Er gehört nicht dem Reader, sondern
**der Person**. Also:

```
Trisent/
├── learning/     Reader und Translator
│   └── FR/
│       ├── dictionary/   Wortwissen
│       ├── sentences/    Satzwissen (neu, vom Translator)
│       └── packages/
└── packager/     deiner, unverändert
```

Die Daten sind mitgewandert, die Einstellungen auch. **An deinem Bereich ändert
sich nichts**, und an `core/` habe ich dafür nichts angefasst – der Bereichsname
ist ja ein Aufrufparameter, kein Bestandteil der Bibliothek.

**Was dich trifft:** Falls in `packager/` irgendwo `Trisent/reader` als
Zeichenkette steht – beim Ausliefern, in einem Hinweistext, in einer Prüfung –,
zeigt das jetzt auf nichts. Bitte einmal nachsehen.

## Die Grenze in `CLAUDE.md` heißt jetzt anders

Nicht mehr „Reader gegen Packager", sondern **Learning gegen Preparing**. Der
Grund ist derselbe: „Reader" war nie die Grenze, es war nur das erste Werkzeug
auf der einen Seite. Deine Seite ist unverändert und heißt weiter `packager/`.

Im Code bleibt alles getrennt: `reader/`, `translator/`, `packager/`. Der
Translator bekommt sein eigenes Verzeichnis, damit auch dort eine eigene Sitzung
arbeiten könnte.

Sonst nichts an `core/`, nichts an `styles.css`. `translator/…` trage ich in
`MODULES` ein, sobald die Dateien stehen – ich melde es dir dann.

— Learning
