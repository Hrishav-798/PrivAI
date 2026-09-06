/**
 * PrivAI — Generic Secret / Credential Detector
 *
 * Detects private keys, session IDs, authorization headers,
 * cookies, connection strings, and other generic credentials.
 */

import { Detector } from '../types';
import { SensitiveRegion, RawDOM } from '../../types';

const SECRET_PATTERNS = [
  // PEM private keys (RSA, EC, DSA, OPENSSH)
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
  // OpenSSH private key files
  /-----BEGIN OPENSSH PRIVATE KEY-----/g,
  // PGP private keys
  /-----BEGIN PGP PRIVATE KEY BLOCK-----/g,
  // Generic session/auth tokens in key-value format
  /\b(?:session[_-]?id|sessionid|auth[_-]?token|csrf[_-]?token|xsrf[_-]?token)\s*[:=]\s*["']?([a-zA-Z0-9_\-]{16,})/gi,
  // Cookie strings
  /\bSet-Cookie:\s*.+/gi,
  /\bdocument\.cookie\s*=\s*/gi,
  // Authorization headers
  /\bAuthorization:\s*(?:Bearer|Basic|Digest)\s+\S+/gi,
  // Database connection strings containing credentials
  /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/[^\s"']+/gi,
  // .env style secret assignments
  /\b(?:DATABASE_URL|DB_PASSWORD|SECRET_KEY|PRIVATE_KEY|ENCRYPTION_KEY|SIGNING_KEY|AWS_SECRET_ACCESS_KEY)\s*=\s*\S+/gi,
];

const SECRET_FIELD_KEYWORDS = [
  'secret', 'private_key', 'private-key', 'privatekey',
  'session_id', 'session-id', 'sessionid', 'csrf_token', 'csrf-token',
  'auth_header', 'authorization', 'cookie', 'set-cookie',
  'encryption_key', 'encryption-key', 'signing_key', 'signing-key',
  'client_secret', 'client-secret',
];

export class SecretDetector implements Detector {
  detect(dom: RawDOM): SensitiveRegion[] {
    const regions: SensitiveRegion[] = [];

    for (const el of dom.elements) {
      const elId = el.element_id || el.id || '';

      // 1. Check element attributes for secret/credential field markers
      const idLow = elId.toLowerCase();
      const labelLow = (el.label || '').toLowerCase();
      const placeholderLow = (el.placeholder || '').toLowerCase();
      const combinedMeta = `${idLow} ${labelLow} ${placeholderLow}`;

      const isSecretField = SECRET_FIELD_KEYWORDS.some((kw) => combinedMeta.includes(kw));

      if (isSecretField) {
        regions.push({
          id: `secret_${elId}`,
          type: 'secret',
          bbox: el.bbox,
          confidence: 0.9,
          source: 'dom',
          redaction: 'blackout',
        });
        continue;
      }

      // 2. Check text and placeholder content for secret patterns
      const textsToCheck = [el.text, el.placeholder].filter((t): t is string => typeof t === 'string' && t.length > 15);
      for (const text of textsToCheck) {
        let matched = false;
        for (const pattern of SECRET_PATTERNS) {
          pattern.lastIndex = 0;
          if (pattern.test(text)) {
            regions.push({
              id: `secret_${elId}`,
              type: 'secret',
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
