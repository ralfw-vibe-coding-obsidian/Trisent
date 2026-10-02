# Trisent

**Fremdsprachige Texte lesen, hören und dabei Wörter lernen – in Obsidian.**

Trisent ist ein Lesegerät für Sprachen, die man lernt. Jeder Text steht
*interlinear* da: unter jedem Wort seine Bedeutung, unter jedem Satz seine
Übersetzung. Je mehr Wörter man kennt, desto mehr Hilfe tritt zurück, bis nur
noch der Text selbst dasteht. Dazu gibt es den Ton, Satz für Satz gesprochen,
und das Wort, das gerade klingt, leuchtet mit.

Alles, was man dabei lernt, gehört einem selbst: Lernstand, Wörterbuch,
Karteikarten und eigene Notizen sind gewöhnliche Notizen in der eigenen Vault.
Man kann sie lesen, durchsuchen und von Hand ändern, und sie funktionieren
ohne Netz, auf dem Rechner wie auf dem Handy.

Trisent besteht aus zwei Teilen: dem **Lernen** mit Reader, Translator und
Lernkartei – und dem **Packager**, der aus beliebigen Texten Lernpakete
schnürt.

---

## Lernen

Drei Werkzeuge, ein gemeinsamer Lernstand. Ein Wort, das man im Reader als
bekannt markiert, ist auch in der Lernkartei bekannt.

### Reader – lesen und hören

*Befehl: **Trisent: Reading***

- Jeder Text auf drei Ebenen: Original, Wort-für-Wort-Bedeutung und flüssige
  Übersetzung. Jede Ebene lässt sich ein- und ausblenden.
- Ein Wort antippen öffnet seine **Wortkarte**: Grundform, Wortart, Bedeutung,
  Formen, Grammatik – und wo es in den eigenen Texten sonst noch vorkommt.
- Jedes Wort hat einen Lernstand: unbekannt, lerne ich, vertraut, bekannt.
  Was bekannt ist, braucht keine Hilfe mehr.
- Der Ton spielt Satz für Satz, auf Wunsch langsamer.
- Texte lassen sich mit **Tags** ordnen und durchsuchen.
- Neue Texte kommen über **Import** in die Bibliothek (siehe unten).

### Translator – übersetzen

*Befehl: **Trisent: Translation***

- Sätze aus den eigenen Texten übersetzen, in beide Richtungen.
- Tippend oder gesprochen.
- Eine KI prüft die Übersetzung und sagt, was nicht stimmt. Dafür braucht der
  Translator einen Schlüssel von [OpenRouter](https://openrouter.ai); was das
  kostet, steht in den Einstellungen.

### Flashcards – die Lernkartei

*Befehl: **Trisent: Flashcards***

- Karten entstehen aus Wörtern, die man im Reader lernen will.
- Wiedervorlage in wachsenden Abständen; der Rhythmus ist einstellbar.
- Jede Karte zeigt die Grammatik des Wortes und Beispielsätze aus den eigenen
  Texten.

---

## Packager – Texte zu Lernpaketen schnüren

*Befehl: **Trisent: Packager** · nur auf dem Desktop*

Die Werkstatt macht aus einem beliebigen fremdsprachigen Text ein Lernpaket:

- Der Text wird in Sätze zerlegt, jedes Wort bekommt Grundform, Wortart und
  Bedeutung, jeder Satz eine flüssige Übersetzung. Das erledigt **Claude**; was
  sich nachrechnen lässt, rechnet die Werkstatt selbst nach.
- Jedes neue Wort wird nach einem **Bauplan** beschrieben, je Wortart: bei
  einem Verb die Formen und Stämme, die man mitlernen muss, bei einem Nomen
  Geschlecht und Plural. Vorbereitete Baupläne gibt es für Französisch,
  Spanisch, Italienisch, Bulgarisch und Russisch; jede andere Sprache bekommt
  einen allgemeinen.
- Je Sprache gibt es **ein Wörterbuch** über alle Texte hinweg – ein Wort wird
  einmal beschrieben, nicht einmal je Text.
- Auf Wunsch spricht eine Stimme von [ElevenLabs](https://elevenlabs.io) jeden
  Satz.
- Das Ergebnis ist ein **ZIP**, das man selbst importiert oder an andere
  weitergibt.

Drei Knöpfe je Text, und der, der gerade dran ist, leuchtet:

| Knopf | Was er tut |
|---|---|
| **Ingest** | Vom Text bis zum fertigen Paket: aufbereiten, fehlende Wörter nachschlagen, verschnüren. Ändert man den Text später, wird nur neu aufbereitet, was sich geändert hat. |
| **Record** | Die Sätze vertonen. |
| **Deploy** | Das Paket nach `Trisent/inbox` legen. |

---

## Installation

### Was man braucht

- **[Obsidian](https://obsidian.md)**, Version 1.4 oder neuer – auf dem Rechner,
  auf dem Handy oder beidem.
- Eine Vault, gern eine bestehende. Trisent legt alles in einen eigenen Ordner
  `Trisent` und lässt den Rest in Ruhe.

Dieses Repository muss man dafür **nicht** herunterladen. Installiert wird
über das Obsidian-Plugin BRAT.

### Schritt 1: BRAT installieren

BRAT installiert Plugins direkt aus einem GitHub-Repository und hält sie
aktuell.

1. In Obsidian: **Einstellungen → Community-Plugins**. Falls noch nicht
   geschehen: Community-Plugins **einschalten** (den eingeschränkten Modus
   verlassen).
2. **Durchsuchen**, nach **BRAT** suchen (von TfTHacker), **Installieren**,
   dann **Aktivieren**.

### Schritt 2: Trisent über BRAT hinzufügen

1. **Einstellungen → BRAT → Add beta plugin**.
2. Als Repository eintragen:

   ```
   https://github.com/ralfw-vibe-coding-obsidian/Trisent
   ```

3. Bei der Version die **neueste** wählen, nicht eine bestimmte Nummer – eine
   fest gewählte Fassung („frozen") aktualisiert BRAT nie. Dann **Add plugin**.
4. **Einstellungen → Community-Plugins**: **Trisent** einschalten.

Links am Rand erscheint das Trisent-Symbol, und in der Befehlspalette
(**Cmd+P** bzw. **Strg+P**) findet man unter `trisent` alle vier Bereiche.

**Aktualisieren:** In den BRAT-Einstellungen bei Trisent **Check and update
plugin** – oder dort **Auto-update plugins at startup** einschalten, dann
geschieht es bei jedem Start von selbst. Nach einem Update Obsidian neu laden:
Befehlspalette → **Reload app without saving** („Anwendung neu laden ohne zu
speichern").

> **Vor einem größeren Update eine Kopie der Vault machen.** Manche Fassungen
> bauen beim ersten Start die Ablage um – ohne Datenverlust, aber nur in eine
> Richtung. Was dabei geschah, steht danach im Logbuch (**Einstellungen →
> Trisent → Open log**).

### Auf dem Handy

1. Obsidian installieren und **dieselbe Vault** öffnen – synchronisiert über
   Obsidian Sync, iCloud oder Ähnliches.
2. BRAT und Trisent wie oben installieren. Wird der Ordner `.obsidian` mit
   synchronisiert, sind beide womöglich schon da und müssen nur eingeschaltet
   werden.
3. **Den Packager ausgeschaltet lassen.** Er braucht Claude Code auf dem
   Rechner und ist auf Handy und Tablet ohnehin immer aus. Lesen, Übersetzen
   und Lernen funktionieren dort vollständig.

Pakete importiert man auch auf dem Handy: ZIP über die Dateien-App nach
`Trisent/inbox` legen, im Reader **Import** drücken.

### Den Packager einschalten (nur Desktop)

Wer nur liest, braucht ihn nicht – deshalb ist er von Haus aus aus.

**Einstellungen → Trisent → Packager** einschalten und Obsidian neu laden.
Dann der Reihe nach prüfen:

**1. Ist Claude Code installiert?**
Der Packager arbeitet mit [Claude Code](https://code.claude.com/docs/en/setup),
dem Kommandozeilenprogramm von Anthropic. Im Terminal:

```bash
claude --version
```

Kommt eine Versionsnummer, ist es da. Sonst installieren – auf macOS und Linux:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Unter Windows in der PowerShell:

```powershell
irm https://claude.ai/install.ps1 | iex
```

**2. Ist Claude Code angemeldet?**
Einmal im Terminal `claude` starten und den Anweisungen zur Anmeldung folgen.
Dafür braucht man ein Claude-Abo oder ein Konto für die Anthropic-API. Der
Packager benutzt dann genau dieses Abo.

**3. Findet Trisent es?**
**Einstellungen → Trisent → Claude command → Test.** Der Test sucht Claude
auch dort, wo Obsidian von sich aus nicht hinschaut, trägt den vollständigen
Pfad ein und macht einen echten, winzigen Aufruf – damit ist auch die
Anmeldung geprüft. Kommt hier eine Fehlermeldung, steht darin, woran es liegt.

**4. In welcher Sprache sollen die Erklärungen stehen?**
**Your language** – Glossen, Übersetzungen und Grammatik werden darin
geschrieben. Vor dem ersten Paket einstellen.

**5. Soll es Ton geben?** *(optional)*
Unter **Voices** den **ElevenLabs key** eintragen und je Sprache eine Stimme
anlegen: Sprachkürzel (`fr`), ein Name zum Wiedererkennen und die Voice-ID aus
ElevenLabs. Der Schlüssel bleibt auf dem Rechner und kommt nie in ein Paket.
Wie viele Aufnahmen das ElevenLabs-Abo gleichzeitig zulässt, merkt der
Packager selbst.

**6. Hausregeln und Baupläne** *(optional)*
Die Werkstatt hat ihre **eigenen Sprachen**, getrennt von denen im Reader.
Mit dem ersten Text einer Sprache legt sie die Sprache an und holt Hausregeln
und Bauplan aus diesem Repository – von selbst. Wer sie vorher ansehen oder
anpassen will, legt die Sprache unter **Languages in the workshop → Add** an.
**Rules and recipes → Fetch** holt später die aktuellen Fassungen für alle
Sprachen der Werkstatt, ohne zu überschreiben, was man selbst geändert hat.

### Texte in Obsidian erzeugen (optional): Claudian

Wer Geschichten nicht nur verpacken, sondern sich gleich in Obsidian schreiben
lassen will – passend zum eigenen Niveau, zu einem Thema, mit bestimmten
Wörtern –, schaltet das Plugin **Claudian** dazu. Es holt Claude Code als
Gesprächspartner in die Vault.

1. **Einstellungen → Community-Plugins → Durchsuchen**, nach **Claudian**
   suchen (von YishenTu), installieren und aktivieren.
2. Claudian benutzt dasselbe Claude Code wie der Packager – ist der Test oben
   gelungen, ist nichts weiter zu tun.

Eine fertige Geschichte legt man als Notiz in den Ordner ihrer Sprache, etwa
`Trisent/packager/FR`, und drückt im Packager **Ingest**.

---

## So geht es los

**Ein Paket von jemand anderem lesen**

1. Die ZIP-Datei nach `Trisent/inbox` legen – am Mac im Finder, am iPhone über
   die Dateien-App. In Obsidians Dateiliste ist der Ordner womöglich
   ausgeblendet; das lässt sich unter **Einstellungen → Trisent** ändern.
2. **Trisent: Reading** öffnen und **Import** drücken.

**Einen eigenen Text verpacken** *(Desktop, Packager eingeschaltet)*

1. **Trisent: Packager** öffnen und **New text** – oder eine Notiz mit dem
   Text in den Sprachordner legen, etwa `Trisent/packager/FR`. Überschriften
   und Kursives darf sie enthalten; verpackt wird der Wortlaut.
2. **Ingest**, auf Wunsch **Record**, dann **Deploy**.
3. Im Reader **Import** – oder das ZIP aus `Trisent/inbox` weitergeben.

Fährt man mit der Maus über einen Knopf, sagt er, warum er gerade an oder aus
ist. Was die App getan hat, steht im **Logbuch**: **Einstellungen → Trisent →
Open log**.

---

## Wo die Daten liegen

```text
Trisent/
├── learning/        deine Bibliothek: Texte, Wörterbuch, Wortnotizen,
│                    Karteikarten, Textnotizen - eine Sprache je Ordner
├── packager/        die Werkstatt: Ausgangstexte, Wortvorrat, Hausregeln
├── inbox/           Pakete als ZIP, die auf den Import warten
└── log.md           was die App getan hat
```

Alles darin sind gewöhnliche Dateien in der eigenen Vault. Die App merkt sich
nichts anderswo.

---

## Für Mitwirkende

Der Code des Plugins liegt in `.obsidian/plugins/my-vault-app/`; dieses
Repository ist zugleich die Vault, in der Trisent entwickelt wird. Wie es
aufgebaut ist und wer woran arbeitet, steht in `CLAUDE.md`, das Paketformat in
`konzept/paketformat.md`. Die Prüfungen laufen mit `node tests/run.js`.

Veröffentlicht wird über Tags: Ein Tag wie `0.12.1` baut das Plugin zu den
drei Dateien `main.js`, `manifest.json` und `styles.css` zusammen und legt sie
als GitHub-Release ab. Dort holt BRAT sie her.
