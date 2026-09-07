import { SensitiveRegion } from '../../types';
import { applyBlackout } from './blackout';
import { applyMask } from './mask';
import { applyBlur } from './blur';

/**
 * Converts a data URL into a CanvasImageSource (Service Worker safe via createImageBitmap)
 */
async function loadImageSource(dataUrl: string): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap !== 'undefined') {
    try {
      let blob: Blob;
      if (dataUrl.startsWith('data:')) {
        const commaIdx = dataUrl.indexOf(',');
        const base64Data = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;
        if (typeof atob !== 'undefined') {
          const binary = atob(base64Data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          blob = new Blob([bytes], { type: 'image/png' });
        } else if (typeof Buffer !== 'undefined') {
          const buf = Buffer.from(base64Data, 'base64');
          blob = new Blob([buf], { type: 'image/png' });
        } else {
          const res = await fetch(dataUrl);
          blob = await res.blob();
        }
      } else {
        const res = await fetch(dataUrl);
        blob = await res.blob();
      }
      const bitmap = await createImageBitmap(blob);
      return { source: bitmap, width: bitmap.width || 300, height: bitmap.height || 150 };
    } catch {
      // Fall through to Image fallback
    }
  }

  if (typeof Image !== 'undefined') {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ source: img, width: img.width || 300, height: img.height || 150 });
      img.onerror = () => reject(new Error('Failed to load image for redaction'));
      img.src = dataUrl;
      // In test environments where Image is a mock or completed synchronously:
      if (img.width || (img as any).complete) {
        resolve({ source: img, width: img.width || 300, height: img.height || 150 });
      }
    });
  }

  throw new Error('Neither createImageBitmap nor Image is available in this environment');
}

/**
 * Exports a canvas or OffscreenCanvas to a base64 PNG data URL
 */
async function exportCanvasToDataUrl(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<string> {
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return `data:image/png;base64,${btoa(binary)}`;
  }

  if (typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement) {
    return canvas.toDataURL('image/png');
  }

  throw new Error('Unsupported canvas type for export');
}

/**
 * Applies on-device redactions to a screenshot data URL and returns the sanitized data URL.
 * Uses OffscreenCanvas in Service Worker / Web Workers without touching the DOM.
 */
export async function redactScreenshot(dataUrl: string, regions: SensitiveRegion[]): Promise<string> {
  const { source, width, height } = await loadImageSource(dataUrl);

  let canvas: HTMLCanvasElement | OffscreenCanvas;
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;

  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(width, height);
    ctx = canvas.getContext('2d');
  } else if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d');
  } else {
    throw new Error('Canvas API not available for screenshot redaction');
  }

  if (!ctx) {
    throw new Error('Failed to obtain 2D canvas context for redaction');
  }

  // Draw original image
  ctx.drawImage(source, 0, 0);

  // Apply each sensitive region's redaction
  for (const region of regions) {
    switch (region.redaction) {
      case 'blackout':
        applyBlackout(ctx, region);
        break;
      case 'mask':
        applyMask(ctx, region);
        break;
      case 'blur':
        applyBlur(ctx, region, source);
        break;
    }
  }

  return await exportCanvasToDataUrl(canvas);
}
