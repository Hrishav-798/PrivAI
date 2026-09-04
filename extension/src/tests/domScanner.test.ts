import { describe, it, expect, beforeEach } from 'vitest';
import { scanDOM } from '../content/domScanner';

describe('DOM Scanner', () => {
  beforeEach(() => {
    // Set up basic DOM
    document.body.innerHTML = `
      <div>
        <button id="btn1">Click Me</button>
        <a href="https://example.com" title="Example Link">Link</a>
        <input type="password" name="pwd" placeholder="Enter password" />
        <input type="email" value="test@example.com" id="email-input" />
        <label for="email-input">Email Address</label>
        <div style="display: none;">
          <button id="hidden-btn">Hidden</button>
        </div>
      </div>
    `;

    // Mock getBoundingClientRect
    window.HTMLElement.prototype.getBoundingClientRect = function() {
      return { x: 10, y: 20, width: 100, height: 30, top: 20, right: 110, bottom: 50, left: 10, toJSON: () => {} };
    };
    window.getComputedStyle = function(el: Element) {
      if (el.parentElement?.style.display === 'none') {
        return { display: 'none', visibility: 'visible', opacity: '1' } as any;
      }
      return { display: 'block', visibility: 'visible', opacity: '1' } as any;
    };
  });

  it('detects interactive elements', () => {
    const data = scanDOM();
    expect(data.counts.interactive).toBe(4);
    expect(data.counts.buttons).toBe(1);
    expect(data.counts.links).toBe(1);
    expect(data.counts.inputs).toBe(2);
  });

  it('assigns stable agent ids', () => {
    const data = scanDOM();
    expect(data.elements.length).toBe(4);
    expect(data.elements[0].id).toMatch(/^agent-btn-\d+$/);
    expect(data.elements[1].id).toMatch(/^agent-link-\d+$/);
    expect(data.elements[2].id).toMatch(/^agent-input-\d+$/);
    expect(data.elements[3].id).toMatch(/^agent-input-\d+$/);
  });

  it('extracts text and labels correctly', () => {
    const data = scanDOM();
    const btn = data.elements.find(e => e.tag === 'button')!;
    const link = data.elements.find(e => e.tag === 'a')!;
    const pwd = data.elements.find(e => e.type === 'password')!;
    const email = data.elements.find(e => e.type === 'email')!;

    expect(btn.text).toBe('Click Me');
    expect(link.label).toBe('Example Link'); // from title
    expect(pwd.text).toBe('Enter password'); // from placeholder
    expect(email.label).toBe('Email Address'); // from associated label
  });

  it('handles bounding boxes correctly', () => {
    const data = scanDOM();
    expect(data.elements[0].bbox.width).toBe(100);
    expect(data.elements[0].bbox.height).toBe(30);
  });
});
