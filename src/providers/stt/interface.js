/**
 * src/providers/stt/interface.js
 * STT provider contract.
 * Every implementation must export a function matching this signature.
 *
 * @typedef {Object} SttResult
 * @property {string} text           – raw transcript text
 * @property {string} language       – detected language code (e.g. 'ar')
 * @property {number} durationSeconds – audio duration in seconds
 *
 * @callback SttProvider
 * @param {Buffer|Blob} audioBuffer – raw audio bytes (webm / ogg / mp3 / wav)
 * @param {string}      mimeType    – e.g. 'audio/webm'
 * @returns {Promise<SttResult>}
 */

// This file is documentation only – implementations are chosen by the factory.
export {};
