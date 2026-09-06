/**
 * PrivAI — Element Registry
 *
 * Maps between agent-assigned element IDs and real DOM elements.
 * Supports lookup by index, ID, text, and description.
 * Persists across DOM mutations within the same page with XPath/CSS fallbacks
 * for resilient recovery from React re-renders and dynamic SPA updates.
 */

export class ElementRegistry {
  private elementIdMap = new WeakMap<Element, string>();
  private idToElementMap = new Map<string, WeakRef<Element>>();
  private indexToIdMap = new Map<number, string>();
  private idToSelectorsMap = new Map<string, { xpath?: string; css?: string }>();
  private idCounter = 0;

  /**
   * Get or assign a stable agent ID for an element.
   * If the element already has a data-agent-id in the DOM, reuses it.
   */
  getIdForElement(element: Element, prefix: string = 'agent-el'): string {
    const existing = this.elementIdMap.get(element);
    if (existing) return existing;

    // Check if element already has a data-agent-id from a previous scan
    const existingAttr = element.getAttribute('data-agent-id');
    if (existingAttr) {
      this.elementIdMap.set(element, existingAttr);
      this.idToElementMap.set(existingAttr, new WeakRef(element));
      return existingAttr;
    }

    const newId = `${prefix}-${this.idCounter++}`;
    this.elementIdMap.set(element, newId);
    this.idToElementMap.set(newId, new WeakRef(element));

    // Inject the ID into the DOM for executor targeting
    element.setAttribute('data-agent-id', newId);

    return newId;
  }

  /**
   * Register highlight index → element ID mapping.
   */
  registerHighlightIndex(index: number, id: string): void {
    this.indexToIdMap.set(index, id);
  }

  /**
   * Register XPath and CSS selector fallbacks for resilient stale element recovery.
   */
  registerSelectors(id: string, xpath?: string, css?: string): void {
    if (xpath || css) {
      this.idToSelectorsMap.set(id, { xpath, css });
    }
  }

  /**
   * Find a DOM element by its agent ID.
   * Implements multi-tier fallback: WeakRef → data-agent-id attribute → XPath → CSS selector.
   */
  findElementById(id: string): Element | null {
    // 1. WeakRef lookup
    const ref = this.idToElementMap.get(id);
    if (ref) {
      const el = ref.deref();
      if (el && el.isConnected) return el;
    }

    // 2. data-agent-id attribute search
    const byAttr = document.querySelector(`[data-agent-id="${id}"]`);
    if (byAttr) {
      this.elementIdMap.set(byAttr, id);
      this.idToElementMap.set(id, new WeakRef(byAttr));
      return byAttr;
    }

    // 3. XPath fallback for recovering from React re-renders that recreated the DOM node
    const selectors = this.idToSelectorsMap.get(id);
    if (selectors?.xpath && typeof document.evaluate === 'function') {
      try {
        const result = document.evaluate(
          selectors.xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        const node = result.singleNodeValue as Element | null;
        if (node && node.isConnected) {
          node.setAttribute('data-agent-id', id);
          this.elementIdMap.set(node, id);
          this.idToElementMap.set(id, new WeakRef(node));
          return node;
        }
      } catch { /* XPath evaluation failed */ }
    }

    // 4. CSS selector fallback
    if (selectors?.css) {
      try {
        const node = document.querySelector(selectors.css);
        if (node && node.isConnected) {
          node.setAttribute('data-agent-id', id);
          this.elementIdMap.set(node, id);
          this.idToElementMap.set(id, new WeakRef(node));
          return node;
        }
      } catch { /* CSS query failed */ }
    }

    return null;
  }

  /**
   * Find a DOM element by its highlight index (e.g., user says "click [3]").
   */
  findElementByIndex(index: number): Element | null {
    const id = this.indexToIdMap.get(index);
    if (!id) return null;
    return this.findElementById(id);
  }

  /**
   * Find an element by text content or label (fuzzy search).
   */
  findElementByDescription(description: string): Element | null {
    const lower = description.toLowerCase().trim();
    if (!lower) return null;

    // 1. Try exact data-agent-id
    let el = document.querySelector(`[data-agent-id="${description}"]`);
    if (el) return el;

    // 2. Try standard DOM id
    el = document.getElementById(description);
    if (el) return el;

    // 3. Try name attribute
    el = document.querySelector(`[name="${description}"]`);
    if (el) return el;

    // 4. Try aria-label, placeholder, title (case-insensitive)
    try {
      el = document.querySelector(
        `[aria-label="${description}" i], [placeholder="${description}" i], [title="${description}" i]`
      );
      if (el) return el;
    } catch { /* invalid selector */ }

    // 5. Try as CSS selector
    try {
      el = document.querySelector(description);
      if (el) return el;
    } catch { /* invalid selector */ }

    // 6. Search interactive elements by text content
    const interactiveEls = document.querySelectorAll(
      'button, a, input[type="button"], input[type="submit"], [role="button"], label, select, [tabindex]'
    );
    for (const btn of interactiveEls) {
      const text = btn.textContent?.trim().toLowerCase() || '';
      if (text === lower || text.includes(lower)) {
        return btn;
      }
    }

    // 7. Search all elements with data-agent-id by substring
    const allAgentEls = document.querySelectorAll('[data-agent-id]');
    for (const ael of allAgentEls) {
      const agentId = ael.getAttribute('data-agent-id') || '';
      if (agentId.includes(lower) || lower.includes(agentId)) {
        return ael;
      }
    }

    return null;
  }

  /**
   * Resolve an element using all available lookup strategies.
   */
  resolveElement(query: string): Element | null {
    return this.findElementById(query) || this.findElementByDescription(query);
  }

  /**
   * Get all registered element IDs.
   */
  getAllIds(): string[] {
    return Array.from(this.idToElementMap.keys());
  }

  /**
   * Reset the registry for a fresh page scan.
   * Clears highlight index counter but preserves existing selector maps
   * for resilient stale element recovery across steps.
   */
  reset(): void {
    this.idCounter = 0;
    this.indexToIdMap.clear();
    // Note: We keep idToElementMap and idToSelectorsMap so actions planned
    // before re-observation can still resolve their targets.
  }

  /**
   * Fully clear all state in the registry.
   */
  clear(): void {
    this.idCounter = 0;
    this.elementIdMap = new WeakMap();
    this.idToElementMap.clear();
    this.indexToIdMap.clear();
    this.idToSelectorsMap.clear();
  }
}

export const registry = new ElementRegistry();
