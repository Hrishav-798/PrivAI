import { SanitizedContext, RawContext } from '../../types';

export class PrivacyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrivacyViolationError';
  }
}

/**
 * Hard Network Gate: Validates that a context is 100% sanitized before any network transmission.
 * Strictly rejects any RawContext and scans SanitizedContext for any unredacted PII, passwords,
 * API keys, credit cards, or private keys.
 */
export function assertSafeToTransmit(context: SanitizedContext | RawContext): asserts context is SanitizedContext {
  // 1. Strict type boundary check
  if ('__brand' in context && context.__brand === 'RawContext') {
    throw new PrivacyViolationError('HARD GATE BLOCKED: Attempted transmission of RawContext.');
  }

  if (!('__brand' in context) || context.__brand !== 'SanitizedContext') {
    throw new PrivacyViolationError('HARD GATE BLOCKED: Context is missing required SanitizedContext branding.');
  }

  if (!context.screenshot) {
    throw new PrivacyViolationError('HARD GATE BLOCKED: Missing sanitized screenshot payload.');
  }

  // 2. Stateless regex patterns (no /g flag to prevent regex state drift across iterations)
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i;
  const phoneRegex = /(?:\+?91[\-\s]?)?[6789]\d{9}|\b\d{3}-\d{2}-\d{4}\b/;
  const aadhaarRegex = /\b\d{4}\s\d{4}\s\d{4}\b/;
  const apiKeyRegex = /\b(?:sk-[a-zA-Z0-9_\-]{20,}|AKIA[0-9A-Z]{16}|gh[posru]_[a-zA-Z0-9]{36,}|AIza[0-9A-Za-z\-_]{35})\b/;
  const creditCardRegex = /\b(?:\d{4}[\s-]?){3}\d{4}\b/;
  const privateKeyRegex = /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/;

  const elements = context.dom?.elements || (context as any).sanitized_dom || [];
  for (const el of elements) {
    const elId = el.element_id || el.id || 'unknown';
    const text = el.text ? el.text.trim() : '';

    if (!text || text === '[REDACTED]') {
      continue;
    }

    // Password check
    const isPassword =
      el.input_type === 'password' ||
      el.type === 'password' ||
      elId.toLowerCase().includes('password');

    if (isPassword && text !== '[REDACTED]') {
      throw new PrivacyViolationError(`HARD GATE BLOCKED: Unredacted password found in element ${elId}`);
    }

    // Email check
    if (emailRegex.test(text)) {
      throw new PrivacyViolationError(`HARD GATE BLOCKED: Unredacted email found in element ${elId}`);
    }

    // Phone check
    if (phoneRegex.test(text)) {
      throw new PrivacyViolationError(`HARD GATE BLOCKED: Unredacted phone number found in element ${elId}`);
    }

    // National ID check
    if (aadhaarRegex.test(text)) {
      throw new PrivacyViolationError(`HARD GATE BLOCKED: Unredacted national ID found in element ${elId}`);
    }

    // API Key check
    if (apiKeyRegex.test(text)) {
      throw new PrivacyViolationError(`HARD GATE BLOCKED: Unredacted API key found in element ${elId}`);
    }

    // Credit Card check
    if (creditCardRegex.test(text)) {
      throw new PrivacyViolationError(`HARD GATE BLOCKED: Unredacted credit card found in element ${elId}`);
    }

    // Private Key check
    if (privateKeyRegex.test(text)) {
      throw new PrivacyViolationError(`HARD GATE BLOCKED: Unredacted private key found in element ${elId}`);
    }
  }

  console.log(
    `[PRIVACY CHECK] Elements: ${context.dom.elements.length}, Redacted: ${context.redactions.length}, Network request: ALLOWED`
  );
}

export const privacyValidator = {
  validate: async (context: any): Promise<boolean> => {
    try {
      assertSafeToTransmit(context);
      return true;
    } catch {
      return false;
    }
  },
};
