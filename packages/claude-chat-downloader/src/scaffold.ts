
import { download } from './utils';
const BUTTON_ID = 'claude-download-button-persistent';
const RAW_BUTTON_ID = 'claude-download-raw-button-persistent';

export function addDownloadButton(downloadFunction: () => void): void {
    if (document.getElementById(BUTTON_ID)) return;

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.innerHTML = '⬇';
    button.title = 'Download conversation';
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
    button.addEventListener('click', () => {
        downloadFunction().then(({ conversation }) => {
            download(`conversation.${conversation.id}.json`, conversation)
        })
    });
    document.body.appendChild(button);

    const rawButton = document.createElement('button');
    rawButton.id = RAW_BUTTON_ID;
    rawButton.innerHTML = '⬇';
    rawButton.title = 'Download raw messages + artifacts';
    rawButton.style.cssText = `
    position: fixed;
    bottom: 80px;
    right: 20px;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: #16a34a;
    color: white;
    border: none;
    font-size: 24px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    transition: all 0.2s;
  `;
    rawButton.addEventListener('mouseenter', () => {
        rawButton.style.transform = 'scale(1.1)';
        rawButton.style.background = '#15803d';
    });
    rawButton.addEventListener('mouseleave', () => {
        rawButton.style.transform = 'scale(1)';
        rawButton.style.background = '#16a34a';
    });
    rawButton.addEventListener('click', () => {
        downloadFunction().then(({ conversation, messages }) => {
            download(`claude.conversation.messages.${conversation.id}.json`, messages)
        })
    });
    document.body.appendChild(rawButton);
}


export function observe(action: () => void): void {
    const observer = new MutationObserver(action);
    observer.observe(document.body, { childList: true, subtree: true });
    action()
}
