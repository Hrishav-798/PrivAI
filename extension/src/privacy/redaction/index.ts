import { SensitiveRegion } from '../../types';
import { applyBlackout } from './blackout';
import { applyMask } from './mask';
import { applyBlur } from './blur';

/**
 * Applies redactions to a screenshot data URL and returns the sanitized data URL.
 * It uses an OffscreenCanvas if available, or a regular canvas in main thread.
 */
export async function redactScreenshot(dataUrl: string, regions: SensitiveRegion[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let canvas: HTMLCanvasElement | OffscreenCanvas;
      let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;

      // In MV3 background scripts (service workers), we must use OffscreenCanvas.
      if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(img.width, img.height);
        ctx = canvas.getContext('2d');
      } else {
        canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx = canvas.getContext('2d');
      }

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Apply redactions
      for (const region of regions) {
        switch (region.redaction) {
          case 'blackout':
            applyBlackout(ctx as CanvasRenderingContext2D, region);
            break;
          case 'mask':
            applyMask(ctx as CanvasRenderingContext2D, region);
            break;
          case 'blur':
            applyBlur(ctx as CanvasRenderingContext2D, region, img);
            break;
        }
      }

      // Export
      if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
        canvas.convertToBlob({ type: 'image/png' })
          .then(blob => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          })
          .catch(reject);
      } else if (canvas instanceof HTMLCanvasElement) {
        resolve(canvas.toDataURL('image/png'));
      }
    };
    img.onerror = () => reject(new Error('Failed to load image for redaction'));
    img.src = dataUrl;
  });
}
