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
    url: ENDPOINT + encodeURIComponent(voice),
    method: 'POST',
    headers: {
      'xi-api-key': key,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg'
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
  if (!answer.arrayBuffer || answer.arrayBuffer.byteLength < 512) {
    throw new Error('The answer contained no sound.');
  }
  return answer.arrayBuffer;
}

/* Fehler des Dienstes in Worte fassen, mit denen man etwas anfangen kann. */
function explain(answer) {
  const status = answer.status;
  if (status === 401) return 'The key was refused. Check it in the settings.';
  if (status === 404) return 'That voice does not exist. Check the voice id.';
  if (status === 422) return 'The service could not use this text.';
  if (status === 409) return 'The voice was busy being set up.';
  if (status === 429) return 'Too many requests at once.';

  let detail = '';
  try {
    const body = JSON.parse(answer.text);
    detail = (body.detail && (body.detail.message || body.detail.status)) || '';
  } catch (error) {
    detail = String(answer.text || '').slice(0, 120);
  }
  return 'The speech service answered with ' + status + (detail ? ': ' + detail : '.');
}

/* Fehlende Tondateien nachziehen. "have" sagt, was schon da ist,
   "write" legt eine Datei an, "step" meldet den Fortschritt. */
async function generate(options) {
  const open = options.sentences.filter((one) => !options.have.has(one.file));
  if (open.length === 0) return { written: 0, skipped: options.sentences.length };

  /* Der erste Satz geht allein los. Danach ist die Stimme bereit, und
     der Rest kann nebeneinander laufen. */
  let written = 0;
  try {
    const bytes = await speak(options.key, options.voice, open[0].source);
    await options.write(open[0].file, bytes);
    written = 1;
    options.step('Speaking… ' + Math.round((1 / open.length) * 100) + '%');
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
        const bytes = await speak(options.key, options.voice, open[at].source);
        await options.write(open[at].file, bytes);
        written += 1;
        options.step('Speaking… ' + Math.round((written / open.length) * 100) + '%');
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
    throw failure;
  }
  return { written: written, skipped: options.sentences.length - open.length };
}

module.exports = { sentencesOf, generate, speak };
