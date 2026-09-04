import { SensitiveRegion } from '../../types';

export function applyMask(ctx: CanvasRenderingContext2D, region: SensitiveRegion) {
  // A gray mask instead of solid black, sometimes with a crosshatch or just a solid color
  ctx.fillStyle = '#6c757d'; // Slate gray
  ctx.fillRect(region.bbox.x, region.bbox.y, region.bbox.width, region.bbox.height);
}
