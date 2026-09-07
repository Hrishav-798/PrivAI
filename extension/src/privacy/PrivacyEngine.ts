import { RawContext, SanitizedContext, SensitiveRegion, RedactionMetadata } from '../types';
import { PasswordDetector } from './detectors/passwordDetector';
import { EmailDetector } from './detectors/emailDetector';
import { PhoneDetector } from './detectors/phoneDetector';
import { IdDetector } from './detectors/idDetector';
import { SemanticDetector } from './detectors/semanticDetector';
import { FaceDetector } from './detectors/faceDetector';
import { ApiKeyDetector } from './detectors/apiKeyDetector';
import { CreditCardDetector } from './detectors/creditCardDetector';
import { SecretDetector } from './detectors/secretDetector';
import { redactScreenshot } from './redaction';
import { sanitizeDOM } from './redaction/domSanitizer';
import { assertSafeToTransmit } from '../network/TransmissionGate';
import { Detector } from './types';

import { mergeOverlappingRegions } from './canonicalRegion';

export class PrivacyEngine {
  private detectors: Detector[];

  constructor() {
    this.detectors = [
      new PasswordDetector(),
      new EmailDetector(),
      new PhoneDetector(),
      new IdDetector(),
      new SemanticDetector(),
      new ApiKeyDetector(),
      new CreditCardDetector(),
      new SecretDetector(),
      // Note: Face detection is supplied via visionRegions (LocalVisionModel / UltraFace ONNX),
      // not through DOM text scanners.
    ];
  }

  /**
   * Processes a RawContext through the privacy pipeline:
   * Detect -> Redact -> Sanitize -> Validate
   * Returns a safely SanitizedContext.
   */
  async process(context: RawContext, visionRegions: SensitiveRegion[] = []): Promise<SanitizedContext> {
    const startTime = performance.now();
    let regions: SensitiveRegion[] = [...visionRegions];

    // 1. Local Privacy Detection
    for (const detector of this.detectors) {
      const detected = detector.detect(context.dom);
      regions = regions.concat(detected);
    }

    // Canonical normalization and deterministic merge of overlapping / duplicate regions
    const canonicalRegions = mergeOverlappingRegions(regions);

    // 2. Screenshot Redaction
    // screenshot is a Blob (Brand<Blob, 'RawScreenshot'>).
    // Let's convert it to Data URL, redact, and convert back to Blob.
    const rawDataUrl = await this.blobToDataUrl(context.screenshot);
    const sanitizedDataUrl = await redactScreenshot(rawDataUrl, canonicalRegions);
    const sanitizedBlob = await this.dataUrlToBlob(sanitizedDataUrl);

    // 3. DOM Sanitization
    const sanitizedDOM = sanitizeDOM(context.dom, canonicalRegions);

    // 4. Generate Metadata (for Audit/Dashboard, without raw values)
    const redactions: RedactionMetadata[] = canonicalRegions.map(r => ({
      id: r.id,
      type: r.type,
      bbox: r.bbox,
      treatment: r.redaction,
      source: r.source,
      severity: r.severity,
      reason: r.reason,
      provenance: r.provenance,
    }));

    const processTime = performance.now() - startTime;

    const sanitizedContext: SanitizedContext = {
      __brand: 'SanitizedContext',
      screenshot: sanitizedBlob as any, // Cast to Brand
      dom: sanitizedDOM,
      redactions,
      privacy: {
        raw_data_removed: true,
        sanitized: true,
        regions_detected: regions.length,
        regions_redacted: regions.length,
        scan_ms: processTime,
        version: '1.0.0',
        timestamp: Date.now(),
        dom_sanitized: true,
        screenshot_sanitized: true,
        url_sanitized: true,
        policy_version: 'privai-v1-zero-egress',
      }
    };

    // 5. Privacy Validation Boundary
    assertSafeToTransmit(sanitizedContext);

    return sanitizedContext;
  }

  private async blobToDataUrl(blob: Blob): Promise<string> {
    if (!blob || blob.size === 0) {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    }
    if (typeof blob.arrayBuffer === 'function') {
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = typeof btoa !== 'undefined' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
      return `data:${blob.type || 'image/png'};base64,${base64}`;
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private async dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx !== -1) {
      const header = dataUrl.slice(0, commaIdx);
      const base64Data = dataUrl.slice(commaIdx + 1);
      const mimeMatch = header.match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/png';

      if (typeof atob !== 'undefined') {
        const binary = atob(base64Data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return new Blob([bytes], { type: mime });
      } else if (typeof Buffer !== 'undefined') {
        const buf = Buffer.from(base64Data, 'base64');
        return new Blob([buf], { type: mime });
      }
    }

    try {
      const res = await fetch(dataUrl);
      return await res.blob();
    } catch {
      return new Blob(['sanitized-pixels'], { type: 'image/png' });
    }
  }
}
