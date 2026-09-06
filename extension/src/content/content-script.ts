import { scanDOM } from './domScanner';
import { readPage, getPageSummary } from './pageReader';
import { toggleOverlay } from './overlay';
import { executeAction } from './executor';
import { AssistantWidget } from './assistantWidget';
import { startObserving, waitForDOMStable } from './mutationObserver';

let lastScannedData: ReturnType<typeof scanDOM> | null = null;
let assistantWidget: AssistantWidget | null = null;

// Initialize in-page assistant widget
function initAssistant() {
  if (!assistantWidget && document.body) {
    assistantWidget = new AssistantWidget();
  }
  // Start observing DOM mutations for dynamic content awareness
  startObserving();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAssistant);
} else {
  initAssistant();
}

// Listen for messages from background service worker
chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ success: true, pong: true });
    return false;
  }

  if (message.type === 'SCAN_PAGE') {
    try {
      lastScannedData = scanDOM();
      sendResponse({ success: true, data: lastScannedData });
    } catch (error: any) {
      sendResponse({ success: false, error: error.message });
    }
    return false;
  }

  if (message.type === 'READ_PAGE') {
    try {
      const result = readPage();
      sendResponse({ success: true, data: result });
    } catch (error: any) {
      sendResponse({ success: false, error: error.message });
    }
    return false;
  }

  if (message.type === 'WAIT_FOR_STABLE') {
    waitForDOMStable(300, 3000)
      .then((stable) => sendResponse({ success: true, data: { stable } }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // async response
  }

  if (message.type === 'TOGGLE_OVERLAY') {
    if (lastScannedData) {
      toggleOverlay(message.payload, lastScannedData.elements);
      sendResponse({ success: true, data: null });
    } else {
      sendResponse({ success: false, error: 'No scan data available. Scan page first.' });
    }
    return false;
  }

  if (message.type === 'TOGGLE_VISION_OVERLAY') {
    const { show, detections } = message.payload as any;
    toggleOverlay(show, detections, true);
    sendResponse({ success: true, data: null });
    return false;
  }

  if (message.type === 'EXECUTE_ACTION') {
    executeAction(message.payload as any)
      .then(() => sendResponse({ success: true, data: null }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // async response
  }

  if (message.type === 'STATE_UPDATE') {
    if (assistantWidget) {
      assistantWidget.updateState(message.payload);
    }
    sendResponse({ success: true });
    return false;
  }

  if (message.type === 'TOGGLE_WIDGET') {
    if (assistantWidget) {
      assistantWidget.toggleDialog();
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'Widget not initialized' });
    }
    return false;
  }

  return false;
});

// Listen for internal events from the Shadow DOM widget
window.addEventListener('message', (event) => {
  if (event.data?.source === 'privai-widget') {
    if (event.data.action === 'TOGGLE_VISION') {
      toggleOverlay(event.data.show, event.data.detections || [], true);
    }
  }
});
