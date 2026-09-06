/**
 * PrivAI — API Key / Token Detector
 *
 * Detects API keys, bearer tokens, JWT tokens, AWS keys, and other
 * access credentials in page content with low false positives.
 */

import { Detector } from '../types';
import { SensitiveRegion, RawDOM } from '../../types';

const API_KEY_PATTERNS = [
  // OpenAI API keys (sk-...)
  /\bsk-[a-zA-Z0-9_\-]{20,}\b/g,
  // Anthropic API keys (sk-ant-...)
  /\bsk-ant-[a-zA-Z0-9_\-]{20,}\b/g,
  // Google AI / Maps API keys (AIza...)
  /\bAIza[0-9A-Za-z\-_]{35}\b/g,
  // GitHub tokens (ghp, gho, ghu, ghs, ghr, github_pat)
  /\b(?:gh[posru]|github_pat)_[a-zA-Z0-9_]{36,}\b/g,
  // Slack tokens (xoxb, xoxp, xoxa, xoxr, xoxs)
  /\bxox[baprs]-[0-9a-zA-Z\-]{10,}\b/g,
  // Stripe API keys (sk_live, sk_test, rk_live, rk_test)
  /\b[sr]k_(?:test|live)_[a-zA-Z0-9]{20,}\b/g,
  // AWS Access Key ID
  /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g,
  // Bearer tokens in headers or text
  /\bBearer\s+[a-zA-Z0-9_\-.~+\/]{20,}\b/gi,
  // JWT tokens (three base64 segments separated by dots)
  /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g,
  // Generic key assignment syntax (e.g. api_key = "abc...", token = "xyz...")
  /\b(?:api[_-]?key|apikey|access[_-]?key|secret[_-]?key|client[_-]?secret|auth[_-]?token)\s*[:=]\s*["']?([a-zA-Z0-9_\-.~+/]{16,})/gi,
];

const KEY_FIELD_KEYWORDS = [
  'api_key', 'apikey', 'api-key', 'access_key', 'access-key',
  'secret_key', 'secret-key', 'token', 'auth_token', 'auth-token',
  'bearer', 'authorization', 'x-api-key', 'client_secret', 'client-secret',
];

export class ApiKeyDetector implements Detector {
  detect(dom: RawDOM): SensitiveRegion[] {
    const regions: SensitiveRegion[] = [];

    for (const el of dom.elements) {
      const elId = el.element_id || el.id || '';

      // 1. Check element attributes (id, label, placeholder, autocomplete)
      const idLow = elId.toLowerCase();
      const labelLow = (el.label || '').toLowerCase();
      const placeholderLow = (el.placeholder || '').toLowerCase();
      const autocompleteLow = (el.autocomplete || '').toLowerCase();
      const combinedMeta = `${idLow} ${labelLow} ${placeholderLow} ${autocompleteLow}`;

      const isKeyField = KEY_FIELD_KEYWORDS.some((kw) => combinedMeta.includes(kw));

      if (isKeyField) {
        regions.push({
          id: `apikey_${elId}`,
          type: 'api_key',
          bbox: el.bbox,
          confidence: 0.95,
          source: 'dom',
          redaction: 'blackout',
        });
        continue;
      }

      // 2. Check text content & placeholder for API key patterns
      const textsToCheck = [el.text, el.placeholder].filter((t): t is string => typeof t === 'string' && t.length > 15);
      for (const text of textsToCheck) {
        let matched = false;
        for (const pattern of API_KEY_PATTERNS) {
          pattern.lastIndex = 0;
          if (pattern.test(text)) {
            regions.push({
              id: `apikey_${elId}`,
              type: 'api_key',
              bbox: el.bbox,
              confidence: 0.85,
              source: 'regex',
              redaction: 'blackout',
            });
            matched = true;
            break;
          }
        }
        if (matched) break;
      }
    }

    return regions;
  }
}
