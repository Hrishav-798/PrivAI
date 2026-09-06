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
  const phoneRegex = /(?:\+(?:[1-9]\d{0,2})[\s.-]?(?:\(?\d{1,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{3,5}(?:\s*(?:ext|x|ext.)\s*\d+)?)|(?:\b\d{3}[\.\-]\d{3}[\.\-]\d{4}\b)|(?:\b\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b)|(?:\b(?:\+?91[\-\s]?)?[6789]\d{9}\b)/;
  const nationalIdRegex = /\b\d{4}[\s\-\.]\d{4}[\s\-\.]\d{4}\b|\b\d{3}-\d{2}-\d{4}\b|\b[A-Z]{5}[0-9]{4}[A-Z]\b/;
  const apiKeyRegex = /\b(?:sk-[a-zA-Z0-9_\-]{20,}|AKIA[0-9A-Z]{16}|gh[posru]_[a-zA-Z0-9]{36,}|AIza[0-9A-Za-z\-_]{35})\b/;
  const creditCardRegex = /\b(?:\d{4}[\s-]?){3}\d{4}\b/;
  const privateKeyRegex = /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/;

  const elements = context.dom?.elements || (context as any).sanitized_dom || [];
  for (const el of elements) {
    const elId = el.element_id || el.id || 'unknown';
    const fieldsToCheck = [
      { name: 'text', val: el.text },
      { name: 'placeholder', val: el.placeholder },
      { name: 'label', val: el.label },
      { name: 'alt', val: el.alt },
      { name: 'selectedValue', val: el.selectedValue },
    ];

    const isPassword =
      el.input_type === 'password' ||
      el.type === 'password' ||
      el.autocomplete?.includes('password') ||
      elId.toLowerCase().includes('password') ||
      elId.toLowerCase().includes('pin');

    for (const field of fieldsToCheck) {
      const val = field.val ? field.val.trim() : '';
      if (!val || val === '[REDACTED]') continue;

      if (isPassword && val !== '[REDACTED]') {
        throw new PrivacyViolationError(`HARD GATE BLOCKED: Unredacted password/credential found in element ${elId} (${field.name})`);
      }

      if (emailRegex.test(val)) {
        throw new PrivacyViolationError(`HARD GATE BLOCKED: Unredacted email found in element ${elId} (${field.name})`);
      }

      if (phoneRegex.test(val)) {
        throw new PrivacyViolationError(`HARD GATE BLOCKED: Unredacted phone number found in element ${elId} (${field.name})`);
      }

      if (nationalIdRegex.test(val)) {
        throw new PrivacyViolationError(`HARD GATE BLOCKED: Unredacted national ID / PAN found in element ${elId} (${field.name})`);
      }

      if (apiKeyRegex.test(val)) {
        throw new PrivacyViolationError(`HARD GATE BLOCKED: Unredacted API key found in element ${elId} (${field.name})`);
      }

      if (creditCardRegex.test(val)) {
        throw new PrivacyViolationError(`HARD GATE BLOCKED: Unredacted credit card found in element ${elId} (${field.name})`);
      }

      if (privateKeyRegex.test(val)) {
        throw new PrivacyViolationError(`HARD GATE BLOCKED: Unredacted private key found in element ${elId} (${field.name})`);
      }
    }
  }

  // 3. Scan semantic tree representation if present
  if (context.dom?.semanticTree) {
    const tree = context.dom.semanticTree;
    if (emailRegex.test(tree)) {
      throw new PrivacyViolationError('HARD GATE BLOCKED: Unredacted email found in semantic tree payload.');
    }
    if (phoneRegex.test(tree)) {
      throw new PrivacyViolationError('HARD GATE BLOCKED: Unredacted phone number found in semantic tree payload.');
    }
    if (nationalIdRegex.test(tree)) {
      throw new PrivacyViolationError('HARD GATE BLOCKED: Unredacted national ID / PAN found in semantic tree payload.');
    }
    if (apiKeyRegex.test(tree)) {
      throw new PrivacyViolationError('HARD GATE BLOCKED: Unredacted API key found in semantic tree payload.');
    }
    if (creditCardRegex.test(tree)) {
      throw new PrivacyViolationError('HARD GATE BLOCKED: Unredacted credit card found in semantic tree payload.');
    }
    if (privateKeyRegex.test(tree)) {
      throw new PrivacyViolationError('HARD GATE BLOCKED: Unredacted private key found in semantic tree payload.');
    }
  }

  // 4. Validate consolidated redaction records (DOM + Vision + OCR Text-Region)
  if (context.redactions && Array.isArray(context.redactions)) {
    for (const r of context.redactions) {
      if (!r.treatment || !['blackout', 'mask', 'blur'].includes(r.treatment)) {
        throw new PrivacyViolationError(`HARD GATE BLOCKED: Invalid or missing redaction treatment for region ${r.id || r.type}`);
      }
      if (!r.bbox || r.bbox.width <= 0 || r.bbox.height <= 0) {
        throw new PrivacyViolationError(`HARD GATE BLOCKED: Invalid bounding box for sensitive region ${r.id || r.type}`);
      }
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
