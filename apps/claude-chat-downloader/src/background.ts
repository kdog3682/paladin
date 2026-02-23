chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'inject' && sender.tab?.id) {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      files: ['injected.js'],
      world: 'MAIN'
    })
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
});
