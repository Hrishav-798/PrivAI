import { SensitiveRegion } from '../../types';

export function applyBlackout(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, region: SensitiveRegion) {
  ctx.fillStyle = 'black';
  ctx.fillRect(region.bbox.x, region.bbox.y, region.bbox.width, region.bbox.height);
}
