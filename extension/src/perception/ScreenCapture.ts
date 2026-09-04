export async function captureVisibleScreen(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab({ format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError.message);
      } else {
        resolve(dataUrl);
      }
    });
  });
}
