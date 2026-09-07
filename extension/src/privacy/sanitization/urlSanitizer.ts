/**
 * PrivAI — URL Sanitizer
 *
 * Strips or redacts sensitive query parameters, auth tokens, API keys,
 * passwords, basic auth, and session identifiers from URLs before any context transmission.
 * Supports recursive multi-pass decoding (anti-obfuscation) and path-segment secret detection.
 */

const SENSITIVE_PARAM_NAMES = new Set([
  'token',
  'page_token',
  'access_token',
  'auth_token',
  'refresh_token',
  'id_token',
  'api_key',
  'apikey',
  'key',
  'secret',
  'client_secret',
  'password',
  'passwd',
  'pwd',
  'auth',
  'authorization',
  'session',
  'session_id',
  'sid',
  'code',
  'auth_code',
  'verification_code',
  'sig',
  'signature',
  'pin',
  'otp',
  'credential',
]);

const PII_VALUE_PATTERNS = [
  // Email
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i,
  // Phone
  /(?:\+?[1-9]\d{0,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/,
  // Aadhaar / SSN / PAN
  /\b\d{4}[\s\-\.]\d{4}[\s\-\.]\d{4}\b|\b\d{3}-\d{2}-\d{4}\b|\b[A-Z]{5}[0-9]{4}[A-Z]\b/,
  // API keys & high-entropy tokens
  /\b(?:sk-[a-zA-Z0-9_\-]{20,}|AKIA[0-9A-Z]{16}|gh[posru]_[a-zA-Z0-9]{36,}|AIza[0-9A-Za-z\-_]{35})\b/,
  // Credit card pattern
  /\b(?:\d{4}[\s-]?){3}\d{4}\b/,
];

/**
 * Recursively decodes URL components up to 3 passes to counteract double/nested encoding.
 */
export function fullyDecode(str: string): string {
  let decoded = str;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
}

function isSensitiveKey(key: string): boolean {
  const decoded = fullyDecode(key).toLowerCase().trim();
  if (SENSITIVE_PARAM_NAMES.has(decoded)) return true;

  // Check key substrings for sensitive words (avoiding innocent terms like 'keyword')
  for (const sensitive of ['token', 'secret', 'password', 'api_key', 'apikey', 'auth', 'passwd', 'credential']) {
    if (decoded.includes(sensitive)) return true;
  }
  return false;
}

function containsPiiValue(value: string): boolean {
  if (!value || value === '[REDACTED]') return false;
  const decoded = fullyDecode(value);

  for (const pattern of PII_VALUE_PATTERNS) {
    if (pattern.test(value) || pattern.test(decoded)) return true;
  }
  return false;
}

/**
 * Sanitizes a URL by replacing sensitive query param values, path segments, and fragment tokens with [REDACTED].
 * Strips basic auth credentials while preserving safe navigation path/query parameters.
 */
export function sanitizeUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';

  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  const isRelative = !trimmed.startsWith('http://') && !trimmed.startsWith('https://');
  const base = 'http://privai.local';

  try {
    const parsed = new URL(isRelative ? base + (trimmed.startsWith('/') ? '' : '/') + trimmed : trimmed);

    // 1. Strip HTTP basic authentication credentials
    if (parsed.username || parsed.password) {
      parsed.username = '';
      parsed.password = '';
    }

    // 2. Sanitize path segments containing high-entropy tokens or PII
    const segments = parsed.pathname.split('/');
    let pathModified = false;
    for (let i = 0; i < segments.length; i++) {
      if (containsPiiValue(segments[i])) {
        segments[i] = '[REDACTED]';
        pathModified = true;
      }
    }
    if (pathModified) {
      parsed.pathname = segments.join('/');
    }

    // 3. Sanitize search parameters (handles duplicates and casing)
    const sensitiveKeys = new Set<string>();
    for (const [k, v] of parsed.searchParams.entries()) {
      if (isSensitiveKey(k) || containsPiiValue(v)) {
        sensitiveKeys.add(k);
      }
    }

    for (const key of sensitiveKeys) {
      parsed.searchParams.delete(key);
      parsed.searchParams.set(key, '[REDACTED]');
    }

    // 4. Sanitize hash fragment if it looks like query params or contains tokens
    if (parsed.hash) {
      const hashContent = parsed.hash.replace(/^#/, '');
      if (hashContent.includes('=')) {
        const hashParams = new URLSearchParams(hashContent);
        const sensitiveHashKeys = new Set<string>();
        for (const [hk, hv] of hashParams.entries()) {
          if (isSensitiveKey(hk) || containsPiiValue(hv)) {
            sensitiveHashKeys.add(hk);
          }
        }
        for (const hk of sensitiveHashKeys) {
          hashParams.delete(hk);
          hashParams.set(hk, '[REDACTED]');
        }
        parsed.hash = '#' + hashParams.toString();
      } else if (containsPiiValue(hashContent)) {
        parsed.hash = '#[REDACTED]';
      }
    }

    if (isRelative) {
      return parsed.pathname + parsed.search + parsed.hash;
    }
    return parsed.toString();
  } catch {
    // If URL parsing fails, scrub any obvious key=value tokens via regex
    return trimmed.replace(
      /([?&#](?:token|page_token|key|secret|password|auth|code|session|api_key|session_id)=)[^&#\s]+/gi,
      '$1[REDACTED]'
    );
  }
}

/**
 * Validates whether a URL contains unredacted sensitive parameters, path tokens, or basic auth.
 * Returns true if sensitive data is detected.
 */
export function hasSensitiveUrlParams(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;

  const isRelative = !rawUrl.startsWith('http://') && !rawUrl.startsWith('https://');
  const base = 'http://privai.local';

  try {
    const parsed = new URL(isRelative ? base + (rawUrl.startsWith('/') ? '' : '/') + rawUrl : rawUrl);

    // Basic auth check
    if (parsed.username || parsed.password) return true;

    // Path segments check
    for (const segment of parsed.pathname.split('/')) {
      if (segment && segment !== '[REDACTED]' && containsPiiValue(segment)) {
        return true;
      }
    }

    // Query parameters check
    for (const [k, v] of parsed.searchParams.entries()) {
      if (v === '[REDACTED]') continue;
      if (isSensitiveKey(k) && v.trim() !== '') return true;
      if (containsPiiValue(v)) return true;
    }

    // Hash fragment check
    if (parsed.hash) {
      const hashContent = parsed.hash.replace(/^#/, '');
      if (hashContent.includes('=')) {
        const hashParams = new URLSearchParams(hashContent);
        for (const [hk, hv] of hashParams.entries()) {
          if (hv === '[REDACTED]') continue;
          if (isSensitiveKey(hk) && hv.trim() !== '') return true;
          if (containsPiiValue(hv)) return true;
        }
      } else if (containsPiiValue(hashContent) && hashContent !== '[REDACTED]') {
        return true;
      }
    }
  } catch {
    // Fallback regex detection
    if (
      /[?&#](?:token|page_token|key|secret|password|auth|session|session_id|api_key)=((?!\[REDACTED\])[^&#\s]+)/i.test(
        rawUrl
      )
    ) {
      return true;
    }
  }

  return false;
}
