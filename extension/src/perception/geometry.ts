export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Calculates the Intersection over Union (IoU) of two bounding boxes.
 */
export function calculateIoU(box1: Rect, box2: Rect): number {
  const xA = Math.max(box1.x, box2.x);
  const yA = Math.max(box1.y, box2.y);
  const xB = Math.min(box1.x + box1.width, box2.x + box2.width);
  const yB = Math.min(box1.y + box1.height, box2.y + box2.height);

  const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  const box1Area = box1.width * box1.height;
  const box2Area = box2.width * box2.height;

  const unionArea = box1Area + box2Area - interArea;
  if (unionArea <= 0) return 0;

  return interArea / unionArea;
}
