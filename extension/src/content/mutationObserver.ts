/**
 * PrivAI — DOM Mutation Observer
 *
 * Handles dynamic website awareness: waits for DOM stability after actions,
 * detects SPA route changes, and monitors for content mutations.
 */

type MutationCallback = () => void;

let observer: MutationObserver | null = null;
let mutationCount = 0;
let lastMutationTime = 0;
let listeners: MutationCallback[] = [];

/**
 * Start observing DOM mutations on the page.
 */
export function startObserving(): void {
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    // Filter out mutations from our own extension UI
    const realMutations = mutations.filter((m) => {
      const target = m.target as Element;
      if (target.closest?.('#privai-assistant-root') || target.closest?.('#privai-overlay-container')) {
        return false;
      }
      return true;
    });

    if (realMutations.length > 0) {
      mutationCount += realMutations.length;
      lastMutationTime = Date.now();

      for (const cb of listeners) {
        try { cb(); } catch { /* ignore listener errors */ }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'disabled', 'checked', 'value'],
    characterData: true,
  });

  // Observe SPA route changes
  window.addEventListener('popstate', handleRouteChange);
  window.addEventListener('hashchange', handleRouteChange);
}

/**
 * Stop observing DOM mutations.
 */
export function stopObserving(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  window.removeEventListener('popstate', handleRouteChange);
  window.removeEventListener('hashchange', handleRouteChange);
  listeners = [];
}

/**
 * Register a callback for DOM changes.
 */
export function onDOMChanged(callback: MutationCallback): () => void {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((cb) => cb !== callback);
  };
}

function handleRouteChange(): void {
  mutationCount++;
  lastMutationTime = Date.now();
  for (const cb of listeners) {
    try { cb(); } catch { /* ignore */ }
  }
}

/**
 * Wait until the DOM stops changing (becomes stable).
 * 
 * After an action (click, type, navigate), the page may take time to update.
 * This waits for mutations to settle before re-observing the page state.
 *
 * @param stabilityThresholdMs - How long with no mutations to consider stable (default: 300ms)
 * @param maxWaitMs - Maximum time to wait before returning anyway (default: 3000ms)
 * @returns Promise that resolves when DOM is stable or timeout reached
 */
export function waitForDOMStable(
  stabilityThresholdMs: number = 300,
  maxWaitMs: number = 3000,
): Promise<boolean> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let checkInterval: ReturnType<typeof setInterval>;

    // Reset mutation count for this wait session
    const startMutationCount = mutationCount;

    const check = () => {
      const elapsed = Date.now() - startTime;
      const timeSinceLastMutation = Date.now() - lastMutationTime;
      const hadMutations = mutationCount > startMutationCount;

      // Stable if: no recent mutations for threshold, or no mutations at all
      if (timeSinceLastMutation >= stabilityThresholdMs || !hadMutations) {
        clearInterval(checkInterval);
        resolve(true);
        return;
      }

      // Timeout
      if (elapsed >= maxWaitMs) {
        clearInterval(checkInterval);
        resolve(false); // Not stable but timed out
        return;
      }
    };

    checkInterval = setInterval(check, 50);
    // Also check immediately in case it's already stable
    check();
  });
}

/**
 * Wait for a specific element to appear in the DOM.
 *
 * @param selector - CSS selector for the element to wait for
 * @param maxWaitMs - Maximum time to wait (default: 5000ms)
 * @returns The element if found, null if timeout
 */
export function waitForElement(
  selector: string,
  maxWaitMs: number = 5000,
): Promise<Element | null> {
  return new Promise((resolve) => {
    // Check immediately
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    const startTime = Date.now();
    let resolved = false;

    const elementObserver = new MutationObserver(() => {
      if (resolved) return;
      const el = document.querySelector(selector);
      if (el) {
        resolved = true;
        elementObserver.disconnect();
        resolve(el);
      }
    });

    elementObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Timeout fallback
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        elementObserver.disconnect();
        resolve(null);
      }
    }, maxWaitMs);
  });
}

/**
 * Wait for page navigation to complete (document.readyState === 'complete').
 */
export function waitForPageLoad(maxWaitMs: number = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    if (document.readyState === 'complete') {
      resolve(true);
      return;
    }

    const startTime = Date.now();

    const checkLoad = () => {
      if (document.readyState === 'complete') {
        resolve(true);
        return;
      }
      if (Date.now() - startTime >= maxWaitMs) {
        resolve(false);
        return;
      }
      setTimeout(checkLoad, 100);
    };

    window.addEventListener('load', () => resolve(true), { once: true });
    setTimeout(checkLoad, 100);
  });
}

/**
 * Detect if a URL navigation happened (for SPA or full-page navigation).
 */
let lastKnownUrl = '';

export function detectUrlChange(): boolean {
  const currentUrl = window.location.href;
  if (lastKnownUrl && currentUrl !== lastKnownUrl) {
    lastKnownUrl = currentUrl;
    return true;
  }
  lastKnownUrl = currentUrl;
  return false;
}

/**
 * Get mutation statistics (for debugging/telemetry).
 */
export function getMutationStats(): { count: number; lastMutationTime: number } {
  return { count: mutationCount, lastMutationTime };
}
