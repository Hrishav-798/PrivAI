/**
 * PrivAI — Hard Transmission Gate
 *
 * Authoritative runtime security boundary enforcing zero-egress invariants.
 * Strictly validates that page context is 100% sanitized before any network transmission.
 * Fails closed on any inconsistency, missing provenance, or unredacted PII.
 */

import { SanitizedContext, RawContext } from '../types';
import { hasSensitiveUrlParams } from '../privacy/sanitization/urlSanitizer';

export class PrivacyViolationError extends Error {
  public readonly code: string;
  public readonly timestamp: number;

  constructor(message: string, code: string = 'PRIVACY_VIOLATION') {
    super(message);
    this.name = 'PrivacyViolationError';
    this.code = code;
    this.timestamp = Date.now();
  }
}

// Stateless regex patterns for post-sanitization validation (no /g flag to prevent regex state drift)
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i;
const PHONE_REGEX = /(?:\+(?:[1-9]\d{0,2})[\s.-]?(?:\(?\d{1,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,5}(?:\s*(?:ext|x|ext.)\s*\d+)?)|(?:\b\d{3}[\.\-]\d{3}[\.\-]\d{4}\b)|(?:\b\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?:\s*(?:ext|x|ext.)\s*\d+)?\b)|(?:\b(?:\+?91[\-\s]?)?[6789]\d{9}\b)/;
const NATIONAL_ID_REGEX = /\b\d{4}[\s\-\.]\d{4}[\s\-\.]\d{4}\b|\b\d{3}-\d{2}-\d{4}\b|\b[A-Z]{5}[0-9]{4}[A-Z]\b/;
const API_KEY_REGEX = /\b(?:sk-[a-zA-Z0-9_\-]{20,}|AKIA[0-9A-Z]{16}|gh[posru]_[a-zA-Z0-9]{36,}|AIza[0-9A-Za-z\-_]{35})\b/;
const CREDIT_CARD_REGEX = /\b(?:\d{4}[\s-]?){3}\d{4}\b/;
const PRIVATE_KEY_REGEX = /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/;

function passesLuhn(numStr: string): boolean {
  const digits = numStr.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

export class TransmissionGate {
  /**
   * Authoritative runtime verification of sanitized context.
   * Throws PrivacyViolationError on any security violation.
   */
  public static assertSafeToTransmit(
    context: unknown
  ): asserts context is SanitizedContext {
    if (!context || typeof context !== 'object') {
      throw new PrivacyViolationError('HARD GATE BLOCKED: Null or non-object context provided.', 'INVALID_CONTEXT');
    }

    const ctx = context as any;

    // 1. Strict prototype & type boundary check
    const pollutedKeys = Object.keys(Object.prototype);
    if (pollutedKeys.length > 0) {
      throw new PrivacyViolationError(
        `HARD GATE BLOCKED: Prototype pollution detected on Object.prototype (${pollutedKeys.join(', ')}).`,
        'PROTOTYPE_POLLUTION'
      );
    }

    const proto = Object.getPrototypeOf(ctx);
    if (proto !== Object.prototype && proto !== null) {
      throw new PrivacyViolationError(
        'HARD GATE BLOCKED: Object prototype manipulation detected.',
        'PROTOTYPE_MANIPULATION'
      );
    }

    if (ctx.__brand === 'RawContext') {
      throw new PrivacyViolationError(
        'HARD GATE BLOCKED: Attempted transmission of RawContext. Zero-egress violation.',
        'RAW_CONTEXT_DETECTED'
      );
    }

    if (ctx.__brand !== 'SanitizedContext') {
      throw new PrivacyViolationError(
        'HARD GATE BLOCKED: Context is missing required SanitizedContext branding.',
        'MISSING_BRAND'
      );
    }

    // 2. Disallow unexpected top-level fields (anti-tampering)
    const ALLOWED_TOP_LEVEL_KEYS = new Set([
      '__brand',
      'screenshot',
      'dom',
      'redactions',
      'privacy',
      'sanitized_dom',
    ]);

    for (const key of Object.keys(ctx)) {
      if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
        throw new PrivacyViolationError(
          `HARD GATE BLOCKED: Unexpected unverified field '${key}' found in context payload.`,
          'UNEXPECTED_FIELD'
        );
      }
    }

    // 3. Screenshot verification
    if (!ctx.screenshot) {
      throw new PrivacyViolationError(
        'HARD GATE BLOCKED: Missing sanitized screenshot payload.',
        'MISSING_SCREENSHOT'
      );
    }

    if ((ctx.screenshot as any).__brand === 'RawScreenshot') {
      throw new PrivacyViolationError(
        'HARD GATE BLOCKED: RawScreenshot brand found on screenshot payload.',
        'RAW_SCREENSHOT_DETECTED'
      );
    }

    if (typeof (ctx.screenshot as any).size === 'number' && (ctx.screenshot as any).size === 0) {
      throw new PrivacyViolationError(
        'HARD GATE BLOCKED: Screenshot payload is empty (0 bytes).',
        'EMPTY_SCREENSHOT'
      );
    }

    // 4. Privacy provenance & metadata integrity
    if (!ctx.privacy || typeof ctx.privacy !== 'object') {
      throw new PrivacyViolationError(
        'HARD GATE BLOCKED: Missing privacy metadata.',
        'MISSING_PRIVACY_METADATA'
      );
    }

    if (ctx.privacy.raw_data_removed === false || ctx.privacy.sanitized === false) {
      throw new PrivacyViolationError(
        'HARD GATE BLOCKED: Privacy metadata indicates unverified or incomplete sanitization.',
        'INCOMPLETE_SANITIZATION'
      );
    }

    if (ctx.privacy.dom_sanitized === false || ctx.privacy.screenshot_sanitized === false || ctx.privacy.url_sanitized === false) {
      throw new PrivacyViolationError(
        'HARD GATE BLOCKED: One or more pipeline stages (DOM/Screenshot/URL) failed verification.',
        'STAGE_VERIFICATION_FAILED'
      );
    }

    // 5. Deep scan entire object tree for hidden secrets or unredacted PII
    TransmissionGate.deepScanForSecrets(ctx);

    // 6. URL Sanitization Check (Scrutinize pageUrl and pageState URL)
    const domUrl = ctx.dom?.url || '';
    if (hasSensitiveUrlParams(domUrl)) {
      throw new PrivacyViolationError(
        `HARD GATE BLOCKED: Unsanitized credentials or tokens found in page URL: ${domUrl}`,
        'SENSITIVE_URL_PARAM'
      );
    }

    const stateUrl = ctx.dom?.pageState?.url || '';
    if (stateUrl && hasSensitiveUrlParams(stateUrl)) {
      throw new PrivacyViolationError(
        `HARD GATE BLOCKED: Unsanitized credentials or tokens found in pageState URL: ${stateUrl}`,
        'SENSITIVE_URL_PARAM'
      );
    }

    // 5. Inspect all DOM elements
    const elements = ctx.dom?.elements || ctx.sanitized_dom || [];
    for (const el of elements) {
      const elId = el.element_id || el.id || 'unknown';
      const rawAny = el as any;
      const fieldsToCheck = [
        { name: 'text', val: el.text },
        { name: 'value', val: rawAny.value },
        { name: 'placeholder', val: el.placeholder },
        { name: 'label', val: el.label },
        { name: 'alt', val: el.alt },
        { name: 'title', val: rawAny.title },
        { name: 'aria-label', val: rawAny['aria-label'] || rawAny.ariaLabel },
        { name: 'aria-describedby', val: rawAny['aria-describedby'] || rawAny.ariaDescribedBy },
        { name: 'selectedValue', val: el.selectedValue },
        { name: 'href', val: el.href },
        { name: 'src', val: el.src },
      ];

      const isPassword =
        el.input_type === 'password' ||
        el.type === 'password' ||
        rawAny.autocomplete?.toLowerCase().includes('password') ||
        rawAny.name?.toLowerCase().includes('password') ||
        rawAny.name?.toLowerCase().includes('passwd') ||
        rawAny.name?.toLowerCase().includes('pwd') ||
        elId.toLowerCase().includes('password') ||
        elId.toLowerCase().includes('passwd') ||
        elId.toLowerCase().includes('pwd') ||
        elId.toLowerCase().includes('pin');

      for (const field of fieldsToCheck) {
        const val = field.val ? String(field.val).trim() : '';
        if (!val || val === '[REDACTED]') continue;

        if (isPassword && val !== '[REDACTED]') {
          throw new PrivacyViolationError(
            `HARD GATE BLOCKED: Unredacted password/credential found in element ${elId} (${field.name})`,
            'LEAKED_PASSWORD'
          );
        }

        if (EMAIL_REGEX.test(val)) {
          throw new PrivacyViolationError(
            `HARD GATE BLOCKED: Unredacted email found in element ${elId} (${field.name})`,
            'LEAKED_EMAIL'
          );
        }

        if (PHONE_REGEX.test(val)) {
          throw new PrivacyViolationError(
            `HARD GATE BLOCKED: Unredacted phone number found in element ${elId} (${field.name})`,
            'LEAKED_PHONE'
          );
        }

        if (NATIONAL_ID_REGEX.test(val)) {
          throw new PrivacyViolationError(
            `HARD GATE BLOCKED: Unredacted national ID / PAN found in element ${elId} (${field.name})`,
            'LEAKED_NATIONAL_ID'
          );
        }

        if (API_KEY_REGEX.test(val)) {
          throw new PrivacyViolationError(
            `HARD GATE BLOCKED: Unredacted API key found in element ${elId} (${field.name})`,
            'LEAKED_API_KEY'
          );
        }

        if (CREDIT_CARD_REGEX.test(val) || passesLuhn(val)) {
          throw new PrivacyViolationError(
            `HARD GATE BLOCKED: Unredacted credit card found in element ${elId} (${field.name})`,
            'LEAKED_CREDIT_CARD'
          );
        }

        if (PRIVATE_KEY_REGEX.test(val)) {
          throw new PrivacyViolationError(
            `HARD GATE BLOCKED: Unredacted private key found in element ${elId} (${field.name})`,
            'LEAKED_PRIVATE_KEY'
          );
        }

        // Check if href or src contains sensitive URL parameters
        if ((field.name === 'href' || field.name === 'src') && hasSensitiveUrlParams(val)) {
          throw new PrivacyViolationError(
            `HARD GATE BLOCKED: Sensitive URL parameter in element ${elId} (${field.name})`,
            'SENSITIVE_ATTRIBUTE_URL'
          );
        }
      }
    }

    // 6. Scan semantic tree representation if present
    if (ctx.dom?.semanticTree) {
      const tree = ctx.dom.semanticTree;
      if (EMAIL_REGEX.test(tree)) {
        throw new PrivacyViolationError(
          'HARD GATE BLOCKED: Unredacted email found in semantic tree payload.',
          'LEAKED_EMAIL_SEMANTIC'
        );
      }
      if (PHONE_REGEX.test(tree)) {
        throw new PrivacyViolationError(
          'HARD GATE BLOCKED: Unredacted phone number found in semantic tree payload.',
          'LEAKED_PHONE_SEMANTIC'
        );
      }
      if (NATIONAL_ID_REGEX.test(tree)) {
        throw new PrivacyViolationError(
          'HARD GATE BLOCKED: Unredacted national ID / PAN found in semantic tree payload.',
          'LEAKED_ID_SEMANTIC'
        );
      }
      if (API_KEY_REGEX.test(tree)) {
        throw new PrivacyViolationError(
          'HARD GATE BLOCKED: Unredacted API key found in semantic tree payload.',
          'LEAKED_API_KEY_SEMANTIC'
        );
      }
      if (CREDIT_CARD_REGEX.test(tree)) {
        throw new PrivacyViolationError(
          'HARD GATE BLOCKED: Unredacted credit card found in semantic tree payload.',
          'LEAKED_CREDIT_CARD_SEMANTIC'
        );
      }
      if (PRIVATE_KEY_REGEX.test(tree)) {
        throw new PrivacyViolationError(
          'HARD GATE BLOCKED: Unredacted private key found in semantic tree payload.',
          'LEAKED_PRIVATE_KEY_SEMANTIC'
        );
      }
      if (hasSensitiveUrlParams(tree)) {
        throw new PrivacyViolationError(
          'HARD GATE BLOCKED: Unsanitized sensitive URL tokens found in semantic tree payload.',
          'SENSITIVE_URL_SEMANTIC'
        );
      }
    }

    // 7. Validate consolidated redaction records (DOM + Vision + OCR Text-Region)
    if (ctx.redactions && Array.isArray(ctx.redactions)) {
      for (const r of ctx.redactions) {
        if (!r.treatment || !['blackout', 'mask', 'blur'].includes(r.treatment)) {
          throw new PrivacyViolationError(
            `HARD GATE BLOCKED: Invalid or missing redaction treatment for region ${r.id || r.type}`,
            'INVALID_REDACTION_TREATMENT'
          );
        }
        if (!r.bbox || r.bbox.width <= 0 || r.bbox.height <= 0) {
          throw new PrivacyViolationError(
            `HARD GATE BLOCKED: Invalid bounding box for sensitive region ${r.id || r.type}`,
            'INVALID_REDACTION_BBOX'
          );
        }
      }
    }
  }

  /**
   * Recursively inspects every key and string value across the entire context object graph
   * to catch any hidden raw secrets, unredacted passwords, card numbers, or leaked tokens.
   */
  private static deepScanForSecrets(root: any): void {
    const visited = new WeakSet();

    const scan = (obj: any, path: string) => {
      if (!obj || typeof obj !== 'object') return;
      if (visited.has(obj)) return;
      visited.add(obj);

      // Skip internal binary buffers (they are verified separately)
      if (typeof Blob !== 'undefined' && obj instanceof Blob) return;
      if (typeof ArrayBuffer !== 'undefined' && obj instanceof ArrayBuffer) return;

      for (const key of Object.keys(obj)) {
        const val = obj[key];
        const currentPath = path ? `${path}.${key}` : key;
        const keyLow = key.toLowerCase();

        // Detect suspicious raw credential property names
        if (
          (keyLow.includes('rawpassword') ||
            keyLow.includes('raw_password') ||
            keyLow.includes('raw_pwd') ||
            keyLow.includes('rawsecret') ||
            keyLow.includes('raw_secret') ||
            keyLow.includes('rawdom') ||
            keyLow.includes('raw_dom') ||
            keyLow.includes('rawscreenshot') ||
            keyLow.includes('raw_screenshot') ||
            keyLow.includes('unredacted') ||
            keyLow.includes('plaintext')) &&
          val &&
          val !== '[REDACTED]'
        ) {
          throw new PrivacyViolationError(
            `HARD GATE BLOCKED: Suspicious sensitive key '${currentPath}' detected in payload.`,
            'SUSPICIOUS_KEY_NAME'
          );
        }

        if (typeof val === 'string') {
          const trimmed = val.trim();
          if (!trimmed || trimmed === '[REDACTED]') continue;

          // Skip structural/metadata keys unless they contain high-entropy secret payloads
          const isStructuralKey = [
            'id', 'element_id', 'tag', 'role', 'semanticRole', 'source',
            'treatment', 'severity', 'policy_version', 'version', 'ruleId',
            'detector', 'rawType', 'action', 'type'
          ].includes(key);

          if (isStructuralKey) {
            if (PRIVATE_KEY_REGEX.test(trimmed) || API_KEY_REGEX.test(trimmed)) {
              throw new PrivacyViolationError(
                `HARD GATE BLOCKED: High-entropy secret in field '${currentPath}'.`,
                'LEAKED_SECRET'
              );
            }
            continue;
          }

          if (PRIVATE_KEY_REGEX.test(trimmed)) {
            throw new PrivacyViolationError(
              `HARD GATE BLOCKED: Unredacted private key in '${currentPath}'.`,
              'LEAKED_PRIVATE_KEY'
            );
          }
          if (API_KEY_REGEX.test(trimmed)) {
            throw new PrivacyViolationError(
              `HARD GATE BLOCKED: Unredacted API key in '${currentPath}'.`,
              'LEAKED_API_KEY'
            );
          }
          if (CREDIT_CARD_REGEX.test(trimmed) || passesLuhn(trimmed)) {
            throw new PrivacyViolationError(
              `HARD GATE BLOCKED: Unredacted credit card in '${currentPath}'.`,
              'LEAKED_CREDIT_CARD'
            );
          }
          if (EMAIL_REGEX.test(trimmed)) {
            throw new PrivacyViolationError(
              `HARD GATE BLOCKED: Unredacted email in '${currentPath}'.`,
              'LEAKED_EMAIL'
            );
          }
          if (PHONE_REGEX.test(trimmed)) {
            throw new PrivacyViolationError(
              `HARD GATE BLOCKED: Unredacted phone in '${currentPath}'.`,
              'LEAKED_PHONE'
            );
          }
          if (NATIONAL_ID_REGEX.test(trimmed)) {
            throw new PrivacyViolationError(
              `HARD GATE BLOCKED: Unredacted national ID in '${currentPath}'.`,
              'LEAKED_NATIONAL_ID'
            );
          }
          if (hasSensitiveUrlParams(trimmed)) {
            throw new PrivacyViolationError(
              `HARD GATE BLOCKED: Unsanitized sensitive URL tokens in '${currentPath}'.`,
              'SENSITIVE_URL_PARAM'
            );
          }
        } else if (typeof val === 'object' && val !== null) {
          scan(val, currentPath);
        }
      }
    };

    scan(root, '');
  }

  /**
   * Safe check returning boolean without throwing.
   */
  public static isSafeToTransmit(context: unknown): boolean {
    try {
      TransmissionGate.assertSafeToTransmit(context);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Convenience wrapper conforming to existing assertSafeToTransmit signature
 */
export function assertSafeToTransmit(context: SanitizedContext | RawContext | unknown): asserts context is SanitizedContext {
  TransmissionGate.assertSafeToTransmit(context);
}
