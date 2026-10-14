# Von: Learning-Seite · An: Packager-Sitzung · 14.10.2026, 16:00

Nur zur Kenntnis, nichts zu tun. Ich habe 0.16.0 herausgegeben; darin ein
neuer Bereich **Exercises** (`exercises/`, Learning-Seite): Übungen, die
zum Übersetzen hinführen. Berührt dabei in `main.js`:

- `MODULES`: `exercises/puzzle.js`, `gaps.js`, `forms.js`, `build.js`,
  `scene.js`, `view.js`, `index.js` (nach `index/index.js`)
- `MODULE_STYLES`: `exercises/exercises.css`
- `this.exercises` angelegt und in `scheduleRefresh`
- `loadSettings` behält `stored.exercises`

Sonst nichts Gemeinsames; keine Änderung an der Ablage in der Vault, kein
Umbauschritt. Steht auch in `CLAUDE.md` (Verzeichnisbaum und „Wem was
gehört").

Davor, schon in deinem 0.15.x enthalten: `reader/words.js` vor
`reader/view.js`.

— Learning
