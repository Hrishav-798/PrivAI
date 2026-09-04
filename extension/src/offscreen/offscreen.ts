import { LocalVisionModel } from '../perception/LocalVisionModel';

console.log('[PrivAI Offscreen] Worker document initialized');

const localVision = new LocalVisionModel();

chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
  if (message?.target !== 'offscreen-vision') {
    return false;
  }

  if (message.type === 'PING') {
    sendResponse({ success: true, ready: localVision.isReady() });
    return false;
  }

  if (message.type === 'INIT_VISION') {
    localVision
      .initialize()
      .then(() => {
        sendResponse({
          success: true,
          backend: localVision.getBackend(),
          modelName: localVision.getModelName(),
          ready: localVision.isReady(),
        });
      })
      .catch((err) => {
        console.error('[PrivAI Offscreen] Model initialization failed:', err);
        sendResponse({
          success: false,
          error: err?.message || String(err),
          backend: localVision.getBackend(),
          modelName: localVision.getModelName(),
          ready: false,
        });
      });
    return true; // Keep channel open for async response
  }

  if (message.type === 'DETECT_VISION') {
    (async () => {
      try {
        const blob = new Blob([message.buffer], { type: 'image/png' });
        const detections = await localVision.detect(blob, message.origWidth, message.origHeight);
        sendResponse({
          success: true,
          detections,
          inferenceMs: localVision.getLastInferenceTime(),
        });
      } catch (err: any) {
        console.error('[PrivAI Offscreen] Vision detection error:', err);
        sendResponse({
          success: false,
          error: err?.message || String(err),
          detections: [],
          inferenceMs: 0,
        });
      }
    })();
    return true; // Keep channel open for async response
  }

  if (message.type === 'GET_STATUS') {
    sendResponse({
      success: true,
      ready: localVision.isReady(),
      backend: localVision.getBackend(),
      modelName: localVision.getModelName(),
      lastInferenceMs: localVision.getLastInferenceTime(),
    });
    return false;
  }

  return false;
});
