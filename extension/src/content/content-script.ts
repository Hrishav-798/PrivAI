import { MessageType, PerceptionData } from '../types/common';
import { scanDOM } from './domScanner';
import { toggleOverlay } from './overlay';

let lastScannedData: PerceptionData | null = null;

chrome.runtime.onMessage.addListener((message: MessageType, sender, sendResponse) => {
  if (message.type === 'SCAN_PAGE') {
    try {
      lastScannedData = scanDOM();
      sendResponse({ success: true, data: lastScannedData });
    } catch (error: any) {
      sendResponse({ success: false, error: error.message });
    }
    return true; // Keep message channel open for async if needed
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
    import('./executor').then(({ executeAction }) => {
      executeAction(message.payload as any)
        .then(() => sendResponse({ success: true, data: null }))
        .catch(err => sendResponse({ success: false, error: err.message }));
    }).catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async
  }
});
