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

/* Einen Satz sprechen lassen. */
async function speak(key, voice, text) {
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
    throw new Error(explain(answer));
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
  if (status === 429) return 'Too many requests at once - try again in a moment.';

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

  let next = 0;
  let written = 0;
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
