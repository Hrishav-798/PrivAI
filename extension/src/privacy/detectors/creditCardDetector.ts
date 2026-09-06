/**
 * PrivAI — Credit Card Number Detector
 *
 * Detects credit/debit card numbers and payment fields using pattern matching
 * and Luhn algorithm validation with low false positives.
 */

import { Detector } from '../types';
import { SensitiveRegion, RawDOM } from '../../types';

/**
 * Validates a card number using the Luhn checksum algorithm.
 * Rejects numbers with invalid lengths or repeated single digits (e.g. 0000...).
 */
export function passesLuhn(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;

  // Reject repeating single digit strings (e.g. all zeros or all ones)
  if (/^(\d)\1+$/.test(digits)) return false;

  let sum = 0;
  let alternate = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }

  return sum % 10 === 0;
}

const CARD_PATTERNS = [
  // Visa: starts with 4, 13 or 16 digits
  /\b4[0-9]{12}(?:[0-9]{3})?\b/g,
  // Mastercard: starts with 51-55 or 2221-2720, 16 digits
  /\b5[1-5][0-9]{14}\b/g,
  /\b2[2-7][0-9]{14}\b/g,
  // Amex: starts with 34 or 37, 15 digits
  /\b3[47][0-9]{13}\b/g,
  // Discover: starts with 6011, 622126-622925, 644-649, 65, 16 digits
  /\b6(?:011|5[0-9]{2})[0-9]{12}\b/g,
  // Formatted 16-digit card numbers: 4 groups of 4 separated by space or dash
  /\b\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4}\b/g,
  // Formatted Amex: 4-6-5 digits separated by space or dash
  /\b3[47]\d{2}[\s-]\d{6}[\s-]\d{5}\b/g,
];

const CARD_FIELD_KEYWORDS = [
  'card_number', 'card-number', 'cardnumber', 'cc_number', 'cc-number',
  'ccnumber', 'credit_card', 'credit-card', 'debit_card', 'debit-card',
  'card_num', 'pan', 'payment_card', 'cvv', 'cvc', 'security_code',
  'security-code', 'card_cvv', 'card_cvc', 'exp_month', 'exp_year',
  'card_exp', 'card_expiry',
];

export class CreditCardDetector implements Detector {
  detect(dom: RawDOM): SensitiveRegion[] {
    const regions: SensitiveRegion[] = [];

    for (const el of dom.elements) {
      const elId = el.element_id || el.id || '';

      // 1. Check element attributes for payment / credit card fields
      const idLow = elId.toLowerCase();
      const labelLow = (el.label || '').toLowerCase();
      const placeholderLow = (el.placeholder || '').toLowerCase();
      const autocompleteLow = (el.autocomplete || '').toLowerCase();
      const combinedMeta = `${idLow} ${labelLow} ${placeholderLow} ${autocompleteLow}`;

      const isCardField = CARD_FIELD_KEYWORDS.some((kw) => combinedMeta.includes(kw))
        || autocompleteLow === 'cc-number'
        || autocompleteLow === 'cc-csc'
        || autocompleteLow === 'cc-exp';

      if (isCardField) {
        regions.push({
          id: `cc_${elId}`,
          type: 'credit_card',
          bbox: el.bbox,
          confidence: 1.0,
          source: 'dom',
          redaction: 'blackout',
        });
        continue;
      }

      // 2. Check text and placeholder content for card numbers
      const textsToCheck = [el.text, el.placeholder].filter((t): t is string => typeof t === 'string' && t.length >= 13);
      for (const text of textsToCheck) {
        let matched = false;
        for (const pattern of CARD_PATTERNS) {
          pattern.lastIndex = 0;
          const matches = text.match(pattern);
          if (matches) {
            for (const match of matches) {
              const digits = match.replace(/\D/g, '');
              if (passesLuhn(digits)) {
                regions.push({
                  id: `cc_${elId}`,
                  type: 'credit_card',
                  bbox: el.bbox,
                  confidence: 0.95,
                  source: 'regex',
                  redaction: 'blackout',
                });
                matched = true;
                break;
              }
            }
          }
          if (matched) break;
        }
        if (matched) break;
      }
    }

    return regions;
  }
}
