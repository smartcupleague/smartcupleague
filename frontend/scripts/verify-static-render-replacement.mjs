import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import process from 'node:process';

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const baseUrl = process.env.SCL_BASE_URL ?? 'http://127.0.0.1:4180';
const profile = `/tmp/smartcup-preserve-ui-cdp-${process.pid}`;
const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--disable-component-update',
  '--disable-sync',
  '--disable-default-apps',
  '--disable-extensions',
  '--no-first-run',
  '--no-default-browser-check',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

const devtoolsUrl = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Chrome DevTools endpoint timed out')), 15_000);
  chrome.stderr.setEncoding('utf8');
  chrome.stderr.on('data', (chunk) => {
    const match = chunk.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (match) {
      clearTimeout(timer);
      resolve(match[1]);
    }
  });
  chrome.once('exit', (code) => reject(new Error(`Chrome exited early with code ${code}`)));
});

const endpoint = new URL(devtoolsUrl);
const targets = await fetch(`http://${endpoint.host}/json/list`).then((response) => response.json());
const pageTarget = targets.find((target) => target.type === 'page');
if (!pageTarget) throw new Error('No Chrome page target found');

const socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const eventWaiters = new Map();
const requests = [];
const webSockets = [];
const consoleErrors = [];

socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
    return;
  }
  if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
  if (message.method === 'Network.webSocketCreated') webSockets.push(message.params.url);
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '));
  }
  const waiter = eventWaiters.get(message.method);
  if (waiter) {
    eventWaiters.delete(message.method);
    waiter(message.params);
  }
});

function command(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function waitForEvent(method, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      eventWaiters.delete(method);
      reject(new Error(`${method} timed out`));
    }, timeoutMs);
    eventWaiters.set(method, (params) => {
      clearTimeout(timer);
      resolve(params);
    });
  });
}

async function navigate(path, expectedText, waitMs = 6_000) {
  const loaded = waitForEvent('Page.loadEventFired');
  await command('Page.navigate', { url: `${baseUrl}${path}` });
  await loaded;
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  const evaluation = await command('Runtime.evaluate', {
    expression: `JSON.stringify({
      text: document.body.innerText,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    })`,
    returnByValue: true,
  });
  const result = JSON.parse(evaluation.result.value);
  if (!result.text.includes(expectedText)) {
    throw new Error(`${path} is missing expected text: ${expectedText}\n${result.text.slice(0, 1500)}`);
  }
  if (result.scrollWidth > result.clientWidth) {
    throw new Error(`${path} overflows horizontally: ${result.scrollWidth} > ${result.clientWidth}`);
  }
  console.log(`PASS ${path} contains ${JSON.stringify(expectedText)}`);
}

try {
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Network.enable');
  await command('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    screenWidth: 1440,
    screenHeight: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await navigate('/', 'The Global Football Prediction Game', 2_000);
  await navigate('/leaderboard', 'SmartPredictor_01', 10_000);
  await navigate('/all-matches', 'Spain', 10_000);
  await navigate('/match/104', 'Spain', 10_000);
  await navigate('/progress', 'World Cup', 10_000);
  await navigate('/predictions/0x3251889ab4310bd5455556f825cacc372fef6592b48c11c7b73745ccd1d0800b', 'Spain', 10_000);
  await navigate('/rules', 'SmartCup', 2_000);

  const renderRequests = [...requests, ...webSockets].filter((url) => url.includes('onrender.com'));
  if (renderRequests.length > 0) {
    throw new Error(`Render requests detected:\n${[...new Set(renderRequests)].join('\n')}`);
  }

  const screenshotPath = process.env.SCL_SCREENSHOT;
  if (screenshotPath) {
    const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  }

  console.log(`PASS no Render requests across ${requests.length} HTTP requests and ${webSockets.length} WebSockets`);
  if (consoleErrors.length) {
    console.log(`INFO browser console errors: ${consoleErrors.length}`);
  }
} finally {
  socket.close();
  chrome.kill('SIGTERM');
}
