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

  /* Eine Liste von Sätzen abspielen.

     Läuft schon dieselbe Liste, hält derselbe Knopf an - und zwar als
     Pause, nicht als Stopp: Beim nächsten Tipp geht es dort weiter, wo
     es aufgehört hat, nicht am Satzanfang. */
  play(items) {
    const same =
      this.queue.length === items.length &&
      this.queue.every((entry, i) => entry.id === items[i].id);

    if (same && this.at >= 0) {
      if (this.player.paused) this.resume();
      else this.pause();
      return;
    }

    this.queue = items;
    this.at = -1;
    this.next();
  }

  /* Den nächsten Satz der Warteschlange. Ist sie zu Ende, ist Schluss. */
  next() {
    this.at += 1;
    if (this.at >= this.queue.length) {
      this.stop();
      return;
    }

    const item = this.queue[this.at];
    this.spokenUnit = undefined;
    this.player.src = item.url ? item.url : this.urlFor(item.file);
    this.player.playbackRate = this.speed;
    this.player.play().catch((error) => {
      new Notice('Could not play this sentence: ' + String(error.message || error));
      this.stop();
    });
    this.report('playing');
  }

  /* Mitlesen: Welches Wort klingt gerade? Die Marken stehen im Paket,
     gerechnet hat sie der Packager aus den Zeichenpositionen - hier wird
     nur nachgeschlagen. Feuert etwa viermal je Sekunde. */
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

  pause() {
    this.player.pause();
    this.report('paused');
  }

  resume() {
    this.player.play().catch((error) => {
      new Notice('Could not continue: ' + String(error.message || error));
      this.stop();
    });
    this.report('playing');
  }

  /* Wo man gerade ist, und in welchem Zustand. */
  report(state) {
    const item = this.queue[this.at];
    this.view.markPlaying(
      item ? item.id : null, state, this.queue.length > 1, item ? item.voice : null
    );
  }

  stop() {
    this.spokenUnit = undefined;
    this.player.pause();
    this.player.removeAttribute('src');
    this.queue = [];
    this.at = -1;
    this.view.markPlaying(null, 'stopped', false);
  }

  /* Die Geschwindigkeit wirkt sofort, auch mitten im Satz. */
  setSpeed(value) {
    this.player.playbackRate = value;
  }
}

/* ------------------------------------------------------------------ */
/* Die eigene Stimme aufnehmen                                         */
/* ------------------------------------------------------------------ */

/* Nachsprechen und sich sofort danach mit der Aufnahme aus dem Paket
   vergleichen. Kein Dienst, kein Schlüssel, kein Netz - die Aufnahme
   bleibt im Arbeitsspeicher und ist beim Verlassen des Textes weg.

   Das eigene Ohr erkennt den Unterschied zuverlässig, wenn beides
   unmittelbar nacheinander kommt. Genau so haben Sprachlabore
   jahrzehntelang gearbeitet. */

/* Damit das Mikrofon nicht aus Versehen offen bleibt. */
const MAX_RECORDING_MS = 30000;

class Recorder {
  constructor(view) {
    this.view = view;
    this.recorder = null;
    this.sentenceId = null;
    this.takes = new Map();
  }

  get running() {
    return !!this.recorder;
  }

  takeFor(sentenceId) {
    return this.takes.get(sentenceId) || null;
  }

  async start(sentenceId) {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      const denied = error && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      new Notice(
        denied
          ? 'Trisent needs permission to use the microphone.'
          : 'No microphone available: ' + String(error.message || error),
        8000
      );
      return false;
    }

    const chunks = [];
    this.recorder = new MediaRecorder(stream);
    this.sentenceId = sentenceId;

    this.recorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    });

    this.recorder.addEventListener('stop', () => {
      /* Das Mikrofon wieder freigeben - sonst leuchtet die Anzeige des
         Rechners weiter, und das beunruhigt zu Recht. */
      for (const track of stream.getTracks()) track.stop();
      window.clearTimeout(this.timer);
      this.recorder = null;

      const id = this.sentenceId;
      this.sentenceId = null;
      if (chunks.length === 0) {
        this.view.recordingDone(id, null);
        return;
      }

      this.replace(id, URL.createObjectURL(new Blob(chunks, { type: chunks[0].type })));
      this.view.recordingDone(id, this.takes.get(id));
    });

    this.recorder.start();
    this.timer = window.setTimeout(() => this.stop(), MAX_RECORDING_MS);
    this.view.markRecording(sentenceId);
    return true;
  }

  stop() {
    if (this.recorder) this.recorder.stop();
  }

  replace(sentenceId, url) {
    const old = this.takes.get(sentenceId);
    if (old) URL.revokeObjectURL(old.url);
    this.takes.set(sentenceId, { url: url });
  }

  discard(sentenceId) {
    const take = this.takes.get(sentenceId);
    if (!take) return;
    URL.revokeObjectURL(take.url);
    this.takes.delete(sentenceId);
  }

  /* Beim Verlassen des Textes alles freigeben. */
  clear() {
    this.stop();
    for (const take of this.takes.values()) URL.revokeObjectURL(take.url);
    this.takes.clear();
  }
}

module.exports = { Playback, Recorder, SPEEDS };
