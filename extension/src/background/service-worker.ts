import { MessageType } from '../types/common';
import { AgentLoop } from './agentLoop';

const agent = new AgentLoop();

chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
  if (message.type === 'CAPTURE_SCREEN') {
    chrome.tabs.captureVisibleTab({ format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, data: dataUrl });
      }
    });
    return true;
  }

  if (message.type === 'START_TASK') {
    const tabId = sender.tab?.id;
    agent.startTask(message.payload, tabId);
    sendResponse({ success: true });
    return false;
  }

  if (message.type === 'STOP_TASK') {
    agent.stop();
    sendResponse({ success: true });
    return false;
  }

  if (message.type === 'GET_STATUS') {
    sendResponse({ success: true, data: agent.getState() });
    return false;
  }
  
  if (message.type === 'SET_FAILURE_MODE') {
    agent.setTestFailureMode(message.payload);
    sendResponse({ success: true });
    return false;
  }
});
