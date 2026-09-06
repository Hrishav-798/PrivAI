/**
 * PrivAI — Real Website Automation & Privacy Integration Tests
 *
 * Simulates real-world website environments:
 * 1. Wikipedia: page reading, heading extraction, scrolling, content reading
 * 2. Google Search: search box identification, query typing, Enter key submission
 * 3. GitHub: repository navigation, button/link resolution, page structure
 * 4. Shopping Site: search, product details, and HIGH-RISK checkout confirmation enforcement
 * 5. Dynamic React/SPA Site: DOM mutations, lazy loading, stale element recovery
 * 6. Local Test Page with Sensitive Data: PII detection, redaction, Hard Network Gate enforcement
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { scanDOM } from '../content/domScanner';
import { readPage } from '../content/pageReader';
import { executeAction } from '../content/executor';
import { registry } from '../content/elementRegistry';
import { classifyActionRisk } from '../background/actionValidator';
import { PrivacyEngine } from '../privacy/PrivacyEngine';
import { sanitizeDOM } from '../privacy/redaction/domSanitizer';
import { privacyValidator } from '../privacy/validation/privacyValidator';
import { RawDOM, SanitizedDOM, SanitizedContext } from '../types';

describe('Real Website Integration Tests', () => {
  beforeEach(() => {
    registry.clear();
    document.body.innerHTML = '';

    // Mock layout measurements
    window.HTMLElement.prototype.getBoundingClientRect = function() {
      return {
        x: 50,
        y: 100,
        width: 300,
        height: 40,
        top: 100,
        right: 350,
        bottom: 140,
        left: 50,
        toJSON: () => {},
      };
    };

    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.scrollBy = vi.fn();
    window.scrollTo = vi.fn();

    window.getComputedStyle = function() {
      return {
        display: 'block',
        visibility: 'visible',
        opacity: '1',
      } as any;
    };
  });

  // ---- 1. Wikipedia ----
  describe('Wikipedia Scenario', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <header>
          <div id="p-logo"><a href="/wiki/Main_Page">Wikipedia</a></div>
          <input type="search" name="search" placeholder="Search Wikipedia" id="searchInput" />
        </header>
        <main id="content">
          <h1 id="firstHeading">Artificial Intelligence</h1>
          <p>Artificial intelligence (AI) is the intelligence of machines or software.</p>
          <h2>History</h2>
          <p>The history of AI began in antiquity...</p>
          <h2>Ethics and Privacy</h2>
          <p>Privacy-preserving AI and client-side processing ensure user confidentiality.</p>
          <table class="wikitable">
            <caption>Comparison of Models</caption>
            <thead>
              <tr><th>Model</th><th>Architecture</th></tr>
            </thead>
            <tbody>
              <tr><td>PrivAI</td><td>Client-Side Privacy + VLM</td></tr>
            </tbody>
          </table>
        </main>
      `;
    });

    it('reads page structure, headings, and tables correctly', () => {
      const pageInfo = readPage();
      expect(pageInfo.headings.length).toBeGreaterThanOrEqual(3);
      expect(pageInfo.headings[0].text).toContain('Artificial Intelligence');
      expect(pageInfo.tables.length).toBe(1);
      expect(pageInfo.tables[0].headers).toEqual(['Model', 'Architecture']);
      expect(pageInfo.tables[0].rows[0]).toEqual(['PrivAI', 'Client-Side Privacy + VLM']);
    });

    it('executes scrolling operations without error', async () => {
      await expect(executeAction({ action: 'scroll', direction: 'down', amount: 500 })).resolves.not.toThrow();
      await expect(executeAction({ action: 'scroll', direction: 'up', amount: 300 })).resolves.not.toThrow();
      await expect(executeAction({ action: 'scroll_to_top' })).resolves.not.toThrow();
      await expect(executeAction({ action: 'scroll_to_bottom' })).resolves.not.toThrow();
    });

    it('scrolls to specific target headings safely', async () => {
      scanDOM();
      const headingEl = document.getElementById('firstHeading')!;
      const assignedId = headingEl.getAttribute('data-agent-id');
      expect(assignedId).toBeTruthy();

      await expect(
        executeAction({
          action: 'scroll_to_element',
          target: assignedId!,
        })
      ).resolves.not.toThrow();
      expect(headingEl.scrollIntoView).toHaveBeenCalled();
    });
  });

  // ---- 2. Google Search ----
  describe('Google Search Scenario', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <form action="/search" method="GET" role="search">
          <textarea id="APjFqb" name="q" title="Search" role="combobox" aria-label="Search" placeholder=""></textarea>
          <input type="submit" value="Google Search" aria-label="Google Search" id="btnSearch" />
        </form>
      `;
    });

    it('identifies search box and allows typing harmless query', async () => {
      const scan = scanDOM();
      const searchBox = scan.elements.find(
        (e) => e.role === 'combobox' || e.tag === 'textarea' || e.tag === 'input'
      );
      expect(searchBox).toBeDefined();

      await expect(
        executeAction({
          action: 'type',
          target: searchBox!.id,
          text: 'Privacy preserving browser agent',
        })
      ).resolves.not.toThrow();

      const inputEl = document.getElementById('APjFqb') as HTMLTextAreaElement;
      expect(inputEl.value).toBe('Privacy preserving browser agent');
    });

    it('supports submitting search with press_key Enter', async () => {
      const scan = scanDOM();
      const searchBox = scan.elements[0];

      await expect(
        executeAction({
          action: 'press_key',
          target: searchBox.id,
          key: 'Enter',
        })
      ).resolves.not.toThrow();
    });
  });

  // ---- 3. GitHub Scenario ----
  describe('GitHub Scenario', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div class="repohead">
          <a href="/Hrishav-798/PrivAI" id="repo-link">Hrishav-798 / PrivAI</a>
          <button id="star-btn" aria-label="Star this repository">Star</button>
          <button id="fork-btn" aria-label="Fork this repository">Fork</button>
          <a href="/Hrishav-798/PrivAI/pulls" id="pr-tab">Pull requests</a>
        </div>
      `;
    });

    it('locates and interacts with GitHub navigation controls', async () => {
      const scan = scanDOM();
      expect(scan.counts.buttons).toBe(2);
      expect(scan.counts.links).toBe(2);

      const starBtn = scan.elements.find((e) => e.text === 'Star');
      expect(starBtn).toBeDefined();

      let clicked = false;
      document.getElementById('star-btn')?.addEventListener('click', () => {
        clicked = true;
      });

      await expect(
        executeAction({
          action: 'click',
          target: starBtn!.id,
        })
      ).resolves.not.toThrow();
      expect(clicked).toBe(true);
    });
  });

  // ---- 4. Shopping Site & High-Risk Confirmation ----
  describe('Shopping Site Scenario & Security Boundaries', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div id="product-page">
          <input type="text" id="twotabsearchtextbox" placeholder="Search Amazon" />
          <h1 id="productTitle">Mechanical Keyboard - Wireless</h1>
          <span id="priceblock_ourprice">$99.99</span>
          <button id="add-to-cart-button">Add to Cart</button>
          <button id="buy-now-button">Buy Now</button>
          <button id="placeYourOrder">Place your order</button>
        </div>
      `;
    });

    it('classifies reading and searching as LOW risk', () => {
      const scan = scanDOM();
      const readRisk = classifyActionRisk({ action: 'read_page' }, scan.elements);
      expect(readRisk).toBe('low');

      const scrollRisk = classifyActionRisk({ action: 'scroll', direction: 'down', amount: 400 }, scan.elements);
      expect(scrollRisk).toBe('low');
    });

    it('enforces HIGH risk classification on financial / purchase actions', () => {
      const scan = scanDOM();
      const buyNowEl = scan.elements.find(e => (e.text || '').toLowerCase().includes('buy now'))!;
      expect(buyNowEl).toBeDefined();

      const buyRisk = classifyActionRisk(
        { action: 'click', target: buyNowEl.id },
        scan.elements
      );
      expect(buyRisk).toBe('high');

      const orderEl = scan.elements.find(e => (e.text || '').toLowerCase().includes('place your order'))!;
      expect(orderEl).toBeDefined();

      const orderRisk = classifyActionRisk(
        { action: 'click', target: orderEl.id },
        scan.elements
      );
      expect(orderRisk).toBe('high');
    });
  });

  // ---- 5. Dynamic React/SPA & Stale Element Recovery ----
  describe('Dynamic React/SPA Scenario', () => {
    it('recovers from re-renders and stale target references via elementRegistry', async () => {
      document.body.innerHTML = `
        <div id="app-root">
          <button id="save-btn" class="btn-primary">Save Changes</button>
        </div>
      `;

      scanDOM();
      const originalBtn = document.getElementById('save-btn')!;
      const originalAgentId = originalBtn.getAttribute('data-agent-id')!;
      expect(originalAgentId).toBeTruthy();

      // Simulate React re-render: DOM nodes replaced with fresh instances
      document.getElementById('app-root')!.innerHTML = `
        <button id="save-btn" class="btn-primary">Save Changes</button>
      `;

      // The previous DOM node is now detached from document
      expect(originalBtn.isConnected).toBe(false);

      // Element registry should resolve the target using XPath/CSS/Text fallback
      const resolved = registry.resolveElement(originalAgentId);
      expect(resolved).not.toBeNull();
      expect(resolved?.isConnected).toBe(true);
      expect(resolved?.id).toBe('save-btn');

      // Click should succeed on the re-rendered element
      let clicked = false;
      resolved?.addEventListener('click', () => {
        clicked = true;
      });

      await expect(
        executeAction({
          action: 'click',
          target: originalAgentId,
        })
      ).resolves.not.toThrow();
      expect(clicked).toBe(true);
    });
  });

  // ---- 6. Sensitive Data Redaction & Hard Network Gate ----
  describe('Local Page with Sensitive Information', () => {
    it('detects and redacts API keys, credit cards, and passwords and passes Hard Gate', async () => {
      document.body.innerHTML = `
        <form id="settings-form">
          <label for="api-key">OpenAI API Key</label>
          <input type="text" id="api-key" value="sk-proj-abc1234567890abcdef1234567890abcdef12345678" />

          <label for="card-num">Credit Card</label>
          <input type="text" id="card-num" value="4532 0151 1283 0366" />

          <label for="pwd">Master Password</label>
          <input type="password" id="pwd" value="SecretPassword123!" />

          <label for="email">User Email</label>
          <input type="email" id="email" value="developer@privai.internal" />

          <button id="submit-btn">Save Settings</button>
        </form>
      `;

      const engine = new PrivacyEngine();
      const rawScan = scanDOM();

      const rawDOM: RawDOM = {
        __brand: 'RawDOM',
        elements: rawScan.elements,
        url: 'http://localhost/account/keys',
        title: 'API Settings',
        timestamp: Date.now(),
        pageState: {
          url: 'http://localhost/account/keys',
          title: 'API Settings',
          scrollY: 0,
          scrollX: 0,
          viewportWidth: 1440,
          viewportHeight: 900,
          totalHeight: 1200,
          totalWidth: 1440,
          readyState: 'complete',
          isStable: true,
        },
      };

      // 1. Detect sensitive regions with PrivacyEngine detectors
      let detectedRegions: any[] = [];
      for (const detector of (engine as any).detectors) {
        const d = detector.detect(rawDOM);
        detectedRegions = detectedRegions.concat(d);
      }
      expect(detectedRegions.length).toBeGreaterThanOrEqual(3);

      // 2. DOM Sanitizer creates clean SanitizedDOM
      const sanitizedDOM: SanitizedDOM = sanitizeDOM(rawDOM, detectedRegions);

      for (const el of sanitizedDOM.elements) {
        expect(el.text).not.toContain('sk-proj-');
        expect(el.text).not.toContain('4532 0151 1283 0366');
        expect(el.text).not.toContain('SecretPassword123!');
        expect(el.text).not.toContain('developer@privai.internal');
      }

      // 3. SanitizedContext is formed
      const cleanContext: SanitizedContext = {
        __brand: 'SanitizedContext',
        screenshot: new Blob(['fake_redacted_screenshot']) as any,
        dom: sanitizedDOM,
        redactions: detectedRegions.map((r) => ({
          type: r.type,
          bbox: r.bbox,
          treatment: r.treatment || r.redaction || 'mask',
        })),
        privacy: {
          raw_data_removed: true,
          sanitized: true,
          regions_detected: detectedRegions.length,
          regions_redacted: detectedRegions.length,
          scan_ms: 10,
        },
      };

      // 4. Hard Network Gate allows the sanitized context
      const gateApproved = await privacyValidator.validate(cleanContext);
      expect(gateApproved).toBe(true);

      // 5. Hard Network Gate strictly blocks any raw, unredacted context
      const leakyContext = {
        ...cleanContext,
        dom: rawDOM, // Contains raw API key and credit card!
        privacy: {
          ...cleanContext.privacy,
          raw_data_removed: false,
          sanitized: false,
        },
      };

      const gateBlocked = await privacyValidator.validate(leakyContext);
      expect(gateBlocked).toBe(false);
    });
  });
});
