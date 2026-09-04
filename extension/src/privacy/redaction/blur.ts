import { SensitiveRegion } from '../../types';

export function applyBlur(ctx: CanvasRenderingContext2D, region: SensitiveRegion, image: HTMLImageElement | HTMLCanvasElement) {
  // Save context state
  ctx.save();
  
  // Set clipping path to the region
  ctx.beginPath();
  ctx.rect(region.bbox.x, region.bbox.y, region.bbox.width, region.bbox.height);
  ctx.clip();
  
  // Apply blur filter and redraw the image in the clipped area
  ctx.filter = 'blur(10px)';
  ctx.drawImage(image, 0, 0);
  
  // Restore state
  ctx.restore();
}
