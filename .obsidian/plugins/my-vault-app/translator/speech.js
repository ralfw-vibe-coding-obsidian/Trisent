"use strict";

/*
 * Die Übersetzung einsprechen statt tippen.
 *
 * Aufgenommen wird im Browser, transkribiert bei OpenRouter - mit
 * demselben Schlüssel, der auch die Prüfung bezahlt. Ein zweiter Dienst
 * und ein zweiter Schlüssel wären hier nur Verwaltung.
 *
 * Hier ist gewöhnliche Spracherkennung das richtige Werkzeug, anders als
 * bei der Aussprache: Geprüft wird ja, was jemand übersetzt hat, nicht
 * wie er es ausspricht. Dass der Erkenner Wörter glattbügelt, schadet
 * dabei nicht.
 *
 * Ein eigener kleiner Aufnehmer, nicht der aus dem Reader: Der liefert
 * eine Adresse zum Abspielen, hier werden Bytes zum Verschicken
 * gebraucht - und der Translator greift nicht in reader/ hinein.
 */

const { requestUrl } = require('obsidian');

const ENDPOINT = 'https://openrouter.ai/api/v1/audio/transcriptions';

/* Damit das Mikrofon nicht aus Versehen offen bleibt. */
const MAX_RECORDING_MS = 60000;

class Dictation {
  constructor(settings) {
    this.settings = settings;
    this.recorder = null;
    this.stream = null;
  }

  /* Auch die Zeit zwischen Knopfdruck und laufendem Mikrofon zählt als
     "läuft schon" - sonst startet ein schneller zweiter Klick eine zweite
     Aufnahme, und die erste bleibt herrenlos offen. */
  get running() {
    return this.starting || !!this.recorder;
  }

  /* Nimmt auf und liefert, wenn gestoppt wurde, den Text. */
  async record(onStart) {
    this.starting = true;
    this.stopRequested = false;

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      this.starting = false;
      const denied = error && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      throw new Error(
        denied
          ? 'Trisent needs permission to use the microphone.'
          : 'No microphone available: ' + String(error.message || error)
      );
    }

    this.stream = stream;
    const chunks = [];
    const recorder = new MediaRecorder(stream);
    this.recorder = recorder;

    const done = new Promise((resolve) => {
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      });
      recorder.addEventListener('stop', () => {
        window.clearTimeout(this.timer);
        /* Mikrofon freigeben, sonst leuchtet die Anzeige des Rechners
           weiter - und das beunruhigt zu Recht. */
        for (const track of stream.getTracks()) track.stop();
        this.recorder = null;
        this.stream = null;
        resolve(chunks);
      });
    });

    recorder.start();
    this.starting = false;
    this.timer = window.setTimeout(() => this.stop(), MAX_RECORDING_MS);
    if (onStart) onStart();

    /* Wurde schon gestoppt, während die Erlaubnis noch eingeholt wurde,
       dann jetzt sofort wieder aus. */
    if (this.stopRequested) recorder.stop();

    const parts = await done;
    if (parts.length === 0) return '';

    const blob = new Blob(parts, { type: parts[0].type || 'audio/webm' });
    return this.transcribe(blob);
  }

  stop() {
    this.stopRequested = true;
    if (this.recorder) this.recorder.stop();
  }

  async transcribe(blob) {
    const key = (this.settings.openRouterKey || '').trim();
    if (!key) throw new Error('No OpenRouter key yet. Put one in the Trisent settings.');

    const buffer = await blob.arrayBuffer();
    const body = {
      model: this.settings.speechModel,
      input_audio: {
        data: toBase64(buffer),
        format: formatOf(blob.type)
      }
    };
    /* Die Sprache mitgeben, in der gesprochen wird - sonst rät der
       Erkenner, und bei kurzen Sätzen rät er gern falsch. */
    if (this.language) body.language = this.language;

    let response;
    try {
      response = await requestUrl({
        url: ENDPOINT,
        method: 'POST',
        throw: false,
        headers: {
          Authorization: 'Bearer ' + key,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://obsidian.md',
          'X-Title': 'Trisent'
        },
        body: JSON.stringify(body)
      });
    } catch (error) {
      throw new Error('Could not reach OpenRouter: ' + String(error.message || error));
    }

    if (response.status === 401) throw new Error('OpenRouter refused the key.');
    if (response.status >= 400) {
      const detail = (response.json && response.json.error && response.json.error.message) || '';
      throw new Error('OpenRouter answered ' + response.status + (detail ? ': ' + detail : ''));
    }

    const text = response.json && typeof response.json.text === 'string' ? response.json.text : '';
    return text.trim();
  }
}

/* Aus "audio/webm;codecs=opus" wird "webm". */
function formatOf(mime) {
  const match = String(mime || '').match(/^audio\/([a-z0-9]+)/i);
  const found = match ? match[1].toLowerCase() : 'webm';
  /* Safari nimmt in mp4 auf; OpenRouter kennt das unter m4a. */
  if (found === 'mpeg') return 'mp3';
  if (found === 'mp4' || found === 'x-m4a') return 'm4a';
  return found;
}

/* Base64 in Stücken - btoa verträgt keine Argumentliste von Megabytes. */
function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

module.exports = { Dictation, formatOf, toBase64 };
