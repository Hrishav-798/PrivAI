import { RawContext, SanitizedContext, SensitiveRegion, RedactionMetadata } from '../types';
import { PasswordDetector } from './detectors/passwordDetector';
import { EmailDetector } from './detectors/emailDetector';
import { PhoneDetector } from './detectors/phoneDetector';
import { IdDetector } from './detectors/idDetector';
import { SemanticDetector } from './detectors/semanticDetector';
import { FaceDetector } from './detectors/faceDetector';
import { redactScreenshot } from './redaction';
import { sanitizeDOM } from './redaction/domSanitizer';
import { assertSafeToTransmit } from './validation/privacyValidator';
import { Detector } from './types';

export class PrivacyEngine {
  private detectors: Detector[];

  constructor() {
    this.detectors = [
      new PasswordDetector(),
      new EmailDetector(),
      new PhoneDetector(),
      new IdDetector(),
      new SemanticDetector(),
      new FaceDetector(),
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

    // 2. Screenshot Redaction
    // screenshot is a Blob (Brand<Blob, 'RawScreenshot'>).
    // Let's convert it to Data URL, redact, and convert back to Blob.
    const rawDataUrl = await this.blobToDataUrl(context.screenshot);
    const sanitizedDataUrl = await redactScreenshot(rawDataUrl, regions);
    const sanitizedBlob = await this.dataUrlToBlob(sanitizedDataUrl);

    // 3. DOM Sanitization
    const sanitizedDOM = sanitizeDOM(context.dom, regions);

    // 4. Generate Metadata (for Audit/Dashboard, without raw values)
    const redactions: RedactionMetadata[] = regions.map(r => ({
      type: r.type,
      bbox: r.bbox,
      treatment: r.redaction
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
        scan_ms: processTime
      }
    };

    // 5. Privacy Validation Boundary
    assertSafeToTransmit(sanitizedContext);

    return sanitizedContext;
  }

  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private async dataUrlToBlob(dataUrl: string): Promise<Blob> {
    const res = await fetch(dataUrl);
    return await res.blob();
  }
}
