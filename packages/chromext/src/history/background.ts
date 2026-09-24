import {downloadHistory} from './downloadHistory'

const BADGE_MS = 3000

const flashBadge = async (text: string, color: string) => {
  await chrome.action.setBadgeBackgroundColor({color})
  await chrome.action.setBadgeText({text})
  setTimeout(() => chrome.action.setBadgeText({text: ''}), BADGE_MS)
}

/* clicking the toolbar icon saves the last 7 days of history as json */
chrome.action.onClicked.addListener(async () => {
  try {
    await chrome.action.setBadgeText({text: '…'})
    const {filename, count} = await downloadHistory({days: 7})
    console.log(`saved ${count} history entries to ${filename}`)
    await flashBadge(count > 999 ? '999+' : String(count), '#2e7d32')
  } catch (err) {
    console.error('history export failed', err)
    await flashBadge('!', '#c62828')
  }
})
