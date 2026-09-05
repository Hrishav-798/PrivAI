import { SensitiveRegion } from '../../types';

export function applyBlur(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  region: SensitiveRegion,
  image: CanvasImageSource
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(region.bbox.x, region.bbox.y, region.bbox.width, region.bbox.height);
  ctx.clip();

  try {
    (ctx as any).filter = 'blur(14px)';
    ctx.drawImage(image, 0, 0);
  } catch {
    // Fallback if filter not supported on specific canvas implementation
    ctx.fillStyle = 'rgba(70, 80, 95, 0.92)';
    ctx.fillRect(region.bbox.x, region.bbox.y, region.bbox.width, region.bbox.height);
  }

  ctx.restore();
}
