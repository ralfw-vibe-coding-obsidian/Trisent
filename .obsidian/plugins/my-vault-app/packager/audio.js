"use strict";

/*
 * Ton erzeugen - einmalig, beim Verpacken.
 *
 * Der Ton entsteht hier und wandert als Datei ins Paket. Der Reader
 * spielt nur ab, was dort liegt: kein Netz beim Lesen, keine laufenden
 * Kosten, und ein Text funktioniert auch in Jahren noch.
 *
 * Der Zugangsschlüssel bleibt in den Einstellungen des Packagers und
 * wandert NIE in ein Paket - ein Paket geht an Fremde.
 */

const { requestUrl } = require('obsidian');
const { nameFor } = require('./build.js');

const ENDPOINT = 'https://api.elevenlabs.io/v1/text-to-speech/';
const WITH_TIMING = '/with-timestamps';
const MODEL = 'eleven_multilingual_v2';
const AT_ONCE = 4;

/* Antworten, bei denen es sich lohnt, kurz zu warten und noch einmal zu
   fragen: Der Dienst ist gerade beschäftigt oder richtet die Stimme erst
   ein. Das sagt nichts über den Satz aus. */
const AGAIN = [409, 429, 500, 502, 503, 504];
const WAITS = [2000, 5000, 10000, 20000];

function pause(ms) {
  return new Promise((done) => window.setTimeout(done, ms));
}

/* Alle Sätze eines Textes in Lesereihenfolge, mit ihrem Dateinamen. */
function sentencesOf(work) {
  const all = [];
  for (const paragraph of work.paragraphs) {
    for (const sentence of paragraph.sentences) {
      all.push({ source: sentence.source, file: nameFor(sentence.source) });
    }
  }
  return all;
}

/* Einen Satz sprechen lassen - mit Geduld.

   Beim allerersten Aufruf richtet der Dienst die Stimme ein und lehnt
   weitere Anfragen so lange ab (409). Wer dann aufgibt, hat den ganzen
   Text verloren, obwohl nur eine Sekunde gefehlt hat. */
async function speak(key, voice, text) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await speakOnce(key, voice, text);
    } catch (error) {
      if (!error.again || attempt >= WAITS.length) throw error;
      await pause(WAITS[attempt]);
    }
  }
}

async function speakOnce(key, voice, text) {
  const answer = await requestUrl({
    url: ENDPOINT + encodeURIComponent(voice) + WITH_TIMING,
    method: 'POST',
    headers: {
      'xi-api-key': key,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      text: text,
      model_id: MODEL,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 }
    }),
    throw: false
  });

  if (answer.status !== 200) {
    const problem = new Error(explain(answer));
    problem.again = AGAIN.indexOf(answer.status) >= 0;
    throw problem;
  }
  /* Mit Zeitmarken kommt die Antwort als JSON: der Ton als Text kodiert,
     dazu für JEDES Zeichen des Satzes ein Anfang und ein Ende. Weil die
     Einheiten ihre Zeichenpositionen kennen, lässt sich daraus später
     genau ausrechnen, wann welches Wort klingt. */
  let body;
  try {
    body = JSON.parse(answer.text);
  } catch (error) {
    throw new Error('The answer could not be read.');
  }
  if (!body.audio_base64) throw new Error('The answer contained no sound.');

  const bytes = decode(body.audio_base64);
  if (bytes.byteLength < 512) throw new Error('The answer contained no sound.');

  const cost = Number((answer.headers || {})['character-cost']);
  return {
    bytes: bytes,
    cost: Number.isFinite(cost) ? cost : 0,
    timing: timingFrom(body.alignment || body.normalized_alignment)
  };
}

/* Der Ton kommt als Text kodiert zurück. */
function decode(text) {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

/* Sekunden zu Millisekunden, je Zeichen. Gespeichert wird nur, was wir
   später brauchen - die Zeichen selbst stehen ja im Satz. */
function timingFrom(alignment) {
  if (!alignment || !Array.isArray(alignment.character_start_times_seconds)) return null;

  const starts = alignment.character_start_times_seconds.map((one) => Math.round(one * 1000));
  const ends = alignment.character_end_times_seconds.map((one) => Math.round(one * 1000));
  if (starts.length === 0) return null;

  return { durationMs: ends[ends.length - 1], starts: starts, ends: ends };
}

/* Fehler des Dienstes in Worte fassen.

   Zuerst das, was der Dienst selbst sagt - er weiß es genauer als wir.
   Einmal stand hinter einem 401 nicht "Schlüssel falsch", sondern "dieser
   Schlüssel hat nur noch 5 Credits, gebraucht werden 10" - und meine
   eigene Formulierung hat das verschluckt. */
function explain(answer) {
  let said = '';
  try {
    const body = JSON.parse(answer.text);
    said = (body.detail && (body.detail.message || body.detail.status)) || body.message || '';
  } catch (error) {
    said = String(answer.text || '').trim().slice(0, 200);
  }
  if (said) return said;

  const status = answer.status;
  if (status === 401) return 'The key was refused. Check it in the settings.';
  if (status === 404) return 'That voice does not exist. Check the voice id.';
  if (status === 422) return 'The service could not use this text.';
  if (status === 409) return 'The voice was busy being set up.';
  if (status === 429) return 'Too many requests at once.';
  return 'The speech service answered with ' + status + '.';
}

/* Fehlende Tondateien nachziehen. "have" sagt, was schon da ist,
   "write" legt eine Datei an, "step" meldet den Fortschritt. */
async function generate(options) {
  /* Offen ist ein Satz, wenn der Ton fehlt - oder wenn es ihn zwar gibt,
     aber ohne Zeitmarken. Die sind erst später dazugekommen. */
  const open = options.sentences.filter(
    (one) => !options.have.has(one.file) || !options.have.get(one.file)
  );
  if (open.length === 0) {
    return { written: 0, credits: 0, skipped: options.sentences.length };
  }

  /* Der erste Satz geht allein los. Danach ist die Stimme bereit, und
     der Rest kann nebeneinander laufen. */
  let written = 0;
  let credits = 0;
  try {
    const first = await speak(options.key, options.voice, open[0].source);
    await options.write(open[0].file, first.bytes, first.timing);
    written = 1;
    credits += first.cost;
    options.step('Recording audio… ' + Math.round((1 / open.length) * 100) + '%');
  } catch (error) {
    error.written = 0;
    throw error;
  }

  let next = 1;
  let failure = null;

  const worker = async () => {
    for (;;) {
      const at = next;
      next += 1;
      if (at >= open.length || failure) return;

      try {
        const spoken = await speak(options.key, options.voice, open[at].source);
        await options.write(open[at].file, spoken.bytes, spoken.timing);
        written += 1;
        credits += spoken.cost;
        options.step('Recording audio… ' + Math.round((written / open.length) * 100) + '%');
      } catch (error) {
        if (!failure) failure = error;
        return;
      }
    }
  };

  const workers = [];
  for (let n = 0; n < Math.min(AT_ONCE, open.length); n++) workers.push(worker());
  await Promise.all(workers);

  if (failure) {
    failure.written = written;
    failure.credits = credits;
    throw failure;
  }
  return {
    written: written,
    credits: credits,
    skipped: options.sentences.length - open.length
  };
}

module.exports = { sentencesOf, generate, speak };
