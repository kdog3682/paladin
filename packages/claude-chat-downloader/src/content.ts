import { observe, addDownloadButton } from './scaffold';
import type { ChatMessage, FoundMessagesEvent } from './types';

function injectMessageFinder(): boolean {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = function(this: HTMLScriptElement) {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
    return true;
  } catch {
    alert('Extension was reloaded — please refresh this page.');
    return false;
  }
}

async function collectChatData(): Promise<{ conversation: any; messages: ChatMessage[] }> {
  return new Promise((resolve) => {
    const handler = (event: MessageEvent<FoundMessagesEvent>) => {
      if (event.data.type === 'FOUND_CONVERSATION') {
        window.removeEventListener('message', handler);
        const { conversation, messages } = event.data as any
        resolve({ conversation, messages });
      }
    };
    
    window.addEventListener('message', handler);
    if (!injectMessageFinder()) {
      window.removeEventListener('message', handler);
      resolve([]);
      return;
    }
    
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
