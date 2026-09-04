import { SanitizedContext, RawContext } from '../../types';

export class PrivacyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrivacyViolationError';
  }
}

/**
 * Validates that a context is safe to transmit over the network.
 * It strictly rejects any RawContext and checks SanitizedContext for remaining PII.
 */
export function assertSafeToTransmit(context: SanitizedContext | RawContext): asserts context is SanitizedContext {
  // 1. Strict type boundary check
  if ('__brand' in context && context.__brand === 'RawContext') {
    throw new PrivacyViolationError('Blocked transmission of RawContext. Only SanitizedContext is allowed.');
  }
  
  if (!('__brand' in context) || context.__brand !== 'SanitizedContext') {
    throw new PrivacyViolationError('Context is missing required SanitizedContext branding.');
  }

  // 2. Deep scan of Sanitized DOM for unredacted sensitive patterns
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
  const phoneRegex = /(\+?91[\-\s]?)?[6789]\d{9}|\b\d{3}-\d{2}-\d{4}\b/g;

  for (const el of context.dom.elements) {
    if (el.text) {
      if (emailRegex.test(el.text)) {
        throw new PrivacyViolationError(`Unredacted email found in element ${el.element_id}`);
      }
      if (phoneRegex.test(el.text)) {
        throw new PrivacyViolationError(`Unredacted phone number found in element ${el.element_id}`);
      }
    }
  }

  // If we reach here, it is safe to transmit.
}
