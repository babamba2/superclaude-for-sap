// Shared by the form renderers: a local headless Chrome / Edge / Chromium.
// Moved unchanged from scripts/smartform/build-preview.mjs (which re-exports these).

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

export function findBrowser() {
  const env = process.env.SC4SAP_CHROME || process.env.CHROME_PATH;
  const list = env ? [env] : process.platform === 'win32' ? [
    `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ] : process.platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ] : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  return list.find((p) => p && existsSync(p)) || null;
}

export function runBrowser(browser, args, profileDir) {
  return spawnSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    `--user-data-dir=${profileDir}`, ...args], { encoding: 'utf8', timeout: 90000, maxBuffer: 64 * 1024 * 1024 });
}
