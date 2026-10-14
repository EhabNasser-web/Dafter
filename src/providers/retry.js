/**
 * src/providers/retry.js
 * Generic exponential-backoff retry helper.
 * Used by all three providers (stt, reviewer, llm).
 *
 * @param {() => Promise<any>} fn       – async function to retry
 * @param {object}             opts
 * @param {number}             opts.attempts   – max total attempts (default 3)
 * @param {number}             opts.baseMs     – base delay in ms (default 500)
 * @param {number}             opts.timeoutMs  – per-attempt timeout in ms (default 30_000)
 * @param {string}             opts.label      – label for log messages
 */
export async function withRetry(fn, {
  attempts = 3,
  baseMs = 500,
  timeoutMs = 30_000,
  label = 'provider',
} = {}) {
  let lastErr;

  // Client errors (400-499 except 429 rate-limit and 408 timeout) will never
  // succeed on retry (bad key, unknown model, bad input) – fail immediately
  // instead of burning `attempts` × `timeoutMs` of the user's time.
  const isRetryable = (err) => {
    const status = err?.status;
    if (typeof status === 'number' && status >= 400 && status < 500 && status !== 429 && status !== 408) {
      return false;
    }
    return true;
  };

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      // Wrap each call in a timeout race
      const result = await Promise.race([
        fn(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`${label}: timeout after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);
      return result;
    } catch (err) {
      lastErr = err;

      if (!isRetryable(err)) {
        console.warn(`[${label}] Non-retryable error (attempt ${attempt}/${attempts}): ${err.message}. Not retrying.`);
        break;
      }

      const isRateLimit =
        err?.status === 429 ||
        err?.error?.type === 'tokens' ||
        /rate[_\s-]?limit|too many requests|\b429\b/i.test(err?.message ?? '');

      if (isRateLimit) {
        // Rate limit: use longer backoff
        const delay = baseMs * 4 * attempt;
        console.warn(`[${label}] Rate limit hit (attempt ${attempt}/${attempts}). Waiting ${delay}ms…`);
        await sleep(delay);
      } else if (attempt < attempts) {
        const delay = baseMs * Math.pow(2, attempt - 1); // 500, 1000, 2000…
        console.warn(`[${label}] Error on attempt ${attempt}/${attempts}: ${err.message}. Retrying in ${delay}ms…`);
        await sleep(delay);
      }
    }
  }

  // All attempts failed – throw a friendly error
  const isRateLimit =
    lastErr?.status === 429 || /rate[_\s-]?limit|too many requests|\b429\b/i.test(lastErr?.message ?? '');

  if (isRateLimit) {
    throw Object.assign(
      new Error(`وصلنا لحد الاستخدام المسموح به مؤقتاً. جرّب تاني بعد شوية.`),
      { code: 'RATE_LIMITED', provider: label }
    );
  }

  throw Object.assign(
    new Error(`${label} فشل بعد ${attempts} محاولات: ${lastErr?.message}`),
    { code: 'PROVIDER_ERROR', provider: label, cause: lastErr }
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
