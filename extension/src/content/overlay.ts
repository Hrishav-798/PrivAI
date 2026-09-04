import { DOMElement } from '../types/common';

let overlayContainer: HTMLDivElement | null = null;

export function toggleOverlay(show: boolean, elements: any[], isVision: boolean = false) {
  if (!show) {
    if (overlayContainer) {
      overlayContainer.remove();
      overlayContainer = null;
    }
    return;
  }

  if (overlayContainer) {
    overlayContainer.innerHTML = '';
  } else {
    overlayContainer = document.createElement('div');
    overlayContainer.id = 'privai-overlay-container';
    overlayContainer.style.position = 'absolute';
    overlayContainer.style.top = '0';
    overlayContainer.style.left = '0';
    overlayContainer.style.width = '100%';
    overlayContainer.style.height = '100%';
    overlayContainer.style.pointerEvents = 'none';
    overlayContainer.style.zIndex = '999999';
    document.body.appendChild(overlayContainer);
  }

  elements.forEach(el => {
    if (!el.bbox) return;

    const box = document.createElement('div');
    box.style.position = 'absolute';
    box.style.left = `${el.bbox.x}px`;
    box.style.top = `${el.bbox.y}px`;
    box.style.width = `${el.bbox.width}px`;
    box.style.height = `${el.bbox.height}px`;
    
    if (isVision) {
      box.style.border = '2px solid rgba(0, 255, 0, 0.9)';
      box.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
    } else {
      box.style.border = '2px solid rgba(255, 0, 0, 0.7)';
      box.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
    }
    box.style.boxSizing = 'border-box';
    
    const label = document.createElement('div');
    if (isVision) {
      label.textContent = `${el.className || el.type || 'vision'} ${(el.confidence || 0).toFixed(2)}`;
      label.style.backgroundColor = 'rgba(0, 255, 0, 0.9)';
      label.style.color = 'black';
    } else {
      label.textContent = el.id || el.element_id;
      label.style.backgroundColor = 'rgba(255, 0, 0, 0.8)';
      label.style.color = 'white';
    }

    label.style.position = 'absolute';
    label.style.top = '-20px';
    label.style.left = '-2px';
    label.style.fontSize = '12px';
    label.style.padding = '2px 4px';
    label.style.borderRadius = '2px';
    label.style.whiteSpace = 'nowrap';
    
    box.appendChild(label);
    overlayContainer!.appendChild(box);
  });
}
