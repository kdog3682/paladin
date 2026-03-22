
import { download } from './utils';
const BUTTON_ID = 'claude-download-button-persistent';

export function addDownloadButton(downloadFunction: () => void): void {
    const existing = document.getElementById(BUTTON_ID);
    if (existing) return;

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.innerHTML = '⬇';
    button.title = 'PLACEHOLDER';
    button.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: #5436DA;
    color: white;
    border: none;
    font-size: 24px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    transition: all 0.2s;
  `;

    button.addEventListener('mouseenter', () => {
        button.style.transform = 'scale(1.1)';
        button.style.background = '#6B46E5';
    });

    button.addEventListener('mouseleave', () => {
        button.style.transform = 'scale(1)';
        button.style.background = '#5436DA';
    });

    function save(result) {
      download(`conversation.${result.id}.json`, result)
    }
    function downloadFunctionWrapper() {
        downloadFunction().then(save)
    }
    button.addEventListener('click', downloadFunctionWrapper);
    document.body.appendChild(button);
}


export function observe(action: () => void): void {
    const observer = new MutationObserver(action);
    observer.observe(document.body, { childList: true, subtree: true });
    action()
}
