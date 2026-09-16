"use strict";

/*
 * Abspielen dessen, was im Paket liegt.
 *
 * Der Ton entsteht beim Verpacken, nicht hier - der Reader spielt nur ab.
 * Deshalb braucht diese Datei kein Netz, keinen Schlüssel und nichts, was
 * beim Lesen Geld kostet. Sie kennt nur lokale Dateien.
 *
 * Drei Ebenen: ein Satz, ein Absatz, der ganze Text. Alle drei laufen
 * über dieselbe Warteschlange - ein Absatz ist nur eine längere Liste
 * von Sätzen als ein einzelner Satz.
 */

const { Notice, normalizePath } = require('obsidian');

/* Die Reihenfolge, in der der Knopf durchschaltet. Erst langsamer - das
   ist beim Lernen der häufigere Wunsch -, dann einmal schneller, dann
   wieder normal. */
const SPEEDS = [1, 0.75, 0.5, 1.5];

class Playback {
  constructor(app, view) {
    this.app = app;
    this.view = view;
    this.player = new Audio();
    this.queue = [];
    this.at = -1;

    this.player.addEventListener('ended', () => this.next());

    /* Mitlesen: Welches Wort klingt gerade? Die Marken stehen im Paket,
       gerechnet hat sie der Packager aus den Zeichenpositionen - hier wird
       nur nachgeschlagen. Feuert etwa viermal je Sekunde. */
    this.player.addEventListener('timeupdate', () => this.followWords());
    this.player.addEventListener('error', () => {
      /* Eine fehlende oder kaputte Tondatei darf nicht die ganze Wiedergabe
         abbrechen - der nächste Satz kann ja in Ordnung sein. */
      const current = this.queue[this.at];
      console.error('Trisent: could not play ' + (current && current.file));
      this.next();
    });
  }

  get speed() {
    const stored = this.view.reader.settings.speed;
    return SPEEDS.includes(stored) ? stored : 1;
  }

  /* Der spielbare Ort einer Datei aus dem Paket. */
  urlFor(file) {
    return this.app.vault.adapter.getResourcePath(
      normalizePath(this.view.packagePath + '/' + file)
    );
  }

  /* Eine Liste von Sätzen abspielen. Läuft schon etwas und ist es dieselbe
     Liste, hört es auf - derselbe Knopf schaltet an und aus. */
  play(items) {
    const same =
      this.queue.length === items.length &&
      this.queue.every((entry, i) => entry.id === items[i].id);

    if (same && this.playing()) {
      this.stop();
      return;
    }

    this.queue = items;
    this.at = -1;
    this.next();
  }

  next() {
    this.at += 1;
    if (this.at >= this.queue.length) {
      this.stop();
      return;
    }

    const item = this.queue[this.at];
    this.spokenUnit = undefined;
    this.player.src = this.urlFor(item.file);
    this.player.playbackRate = this.speed;
    this.player.play().catch((error) => {
      new Notice('Could not play this sentence: ' + String(error.message || error));
      this.stop();
    });
    this.view.markPlaying(item.id, this.queue.length > 1);
  }

  followWords() {
    const item = this.queue[this.at];
    if (!item || !item.timings || item.timings.length === 0) return;

    const ms = this.player.currentTime * 1000;
    let unit = null;
    for (const mark of item.timings) {
      if (ms >= mark.startMs && ms < mark.endMs) {
        unit = mark.unit;
        break;
      }
    }

    /* Zwischen zwei Wörtern liegt Stille - dann ist nichts hervorgehoben,
       statt dass die Markierung am letzten Wort kleben bleibt. */
    if (unit === this.spokenUnit) return;
    this.spokenUnit = unit;
    this.view.markSpokenWord(item.id, unit);
  }

  playing() {
    return this.at >= 0 && !this.player.paused;
  }

  stop() {
    this.spokenUnit = undefined;
    this.player.pause();
    this.player.removeAttribute('src');
    this.queue = [];
    this.at = -1;
    this.view.markPlaying(null, false);
  }

  /* Die Geschwindigkeit wirkt sofort, auch mitten im Satz. */
  setSpeed(value) {
    this.player.playbackRate = value;
  }
}

module.exports = { Playback, SPEEDS };
