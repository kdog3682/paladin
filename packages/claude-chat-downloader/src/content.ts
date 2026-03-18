import { observe, addDownloadButton } from './scaffold';
import type { ChatMessage, FoundMessagesEvent } from './types';

function injectMessageFinder(): void {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function(this: HTMLScriptElement) {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}

async function collectChatData(): Promise<ChatMessage[]> {
  return new Promise((resolve) => {
    const handler = (event: MessageEvent<FoundMessagesEvent>) => {
      if (event.data.type === 'FOUND_CONVERSATION') {
        window.removeEventListener('message', handler);
        resolve(event.data.conversation);
      }
    };
    
    window.addEventListener('message', handler);
    injectMessageFinder();
    
    setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve([]);
    }, 10000);
  });
}

function initialize(): void {
  if (!window.location.hostname.includes('claude.ai')) {
    return;
  }
  
  addDownloadButton(collectChatData);
}

observe(initialize);
