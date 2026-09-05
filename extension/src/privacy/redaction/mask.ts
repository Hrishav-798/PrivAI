import { SensitiveRegion } from '../../types';

export function applyMask(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, region: SensitiveRegion) {
  // A gray mask instead of solid black
  ctx.fillStyle = '#6c757d'; // Slate gray
  ctx.fillRect(region.bbox.x, region.bbox.y, region.bbox.width, region.bbox.height);
}
