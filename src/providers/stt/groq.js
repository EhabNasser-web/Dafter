/**
 * src/providers/stt/groq.js
 * STT implementation using Groq's Whisper API.
 *
 * Groq endpoint: POST https://api.groq.com/openai/v1/audio/transcriptions
 * We send multipart/form-data with the audio file.
 *
 * Returns: { text, language, durationSeconds }
 */

import FormData from 'form-data';
import fetch from 'node-fetch';
import { withRetry } from '../retry.js';

const GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODEL = 'whisper-large-v3-turbo'; // fastest + best Arabic quality on Groq

/**
 * Transcribe audio using Groq Whisper.
 *
 * @param {Buffer} audioBuffer  – raw audio bytes
 * @param {string} mimeType     – e.g. 'audio/webm', 'audio/ogg', 'audio/mp3'
 * @param {string} [filename]   – hint for Groq (affects format detection)
 * @returns {Promise<{text: string, language: string, durationSeconds: number}>}
 */
export async function transcribeWithGroq(audioBuffer, mimeType = 'audio/webm', filename = 'audio.webm') {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not set in environment.');
  }

  return withRetry(
    async () => {
      const form = new FormData();
      form.append('file', audioBuffer, { filename, contentType: mimeType });
      form.append('model', MODEL);
      form.append('language', 'ar'); // force Arabic – speeds up and improves accuracy
      form.append('response_format', 'verbose_json'); // gives us duration

      const res = await fetch(GROQ_STT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          ...form.getHeaders(),
        },
        body: form,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const error = new Error(err?.error?.message ?? `Groq STT HTTP ${res.status}`);
        error.status = res.status;
        throw error;
      }

      const data = await res.json();

      return {
        text: (data.text ?? '').trim(),
        language: data.language ?? 'ar',
        durationSeconds: Math.ceil(data.duration ?? 0),
      };
    },
    { label: 'groq-stt', attempts: 3, baseMs: 600, timeoutMs: 60_000 }
  );
}
