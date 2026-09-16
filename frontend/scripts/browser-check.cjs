// Run against a hidden Chrome instance started with --remote-debugging-port=9222.
// Public live checks by default; optional staff writes use only the disposable test preview.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const base = process.env.CITYLENS_URL || 'http://localhost:3000';

async function main() {
  const tabs = await (await fetch('http://localhost:9222/json')).json();
  const tab = tabs.find(item => item.type === 'page');
  const socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map(), errors = [], streams = [];
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const job = pending.get(message.id);
      pending.delete(message.id);
      message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.method === 'Network.webSocketHandshakeResponseReceived') streams.push(message.params.response.status);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const waitFor = async expression => {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error(`Timed out: ${expression}\n${await evaluate('document.body.innerText.slice(0, 4500)')}`);
  };
  const click = text => evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(text)});if(!button)throw new Error('Button missing');button.click()})()`);
  const fill = (selector, value) => evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});const proto=input.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  const screenshot = async name => {
    const file = path.join(os.tmpdir(), `citylens-${name}.png`);
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(`Screenshot: ${file}`);
  };
  try {
    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
    await send('Page.navigate', { url: 'about:blank' });
    await waitFor(`location.href==='about:blank'`);
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1060, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: base + '/#overview' });
    await waitFor(`document.body.innerText.includes('Backend connected') && document.body.innerText.includes('LIVE EVENT FEED')`);
    const live = await (await fetch(base + '/api/v1/events?page_size=1')).json();
    await waitFor(`document.querySelector('.summary-number')?.textContent===${JSON.stringify(live.total.toLocaleString())}`);
    await screenshot('live-desktop');
    await click('Explore demo');
    await waitFor(`document.querySelector('.summary-number')?.textContent==='12' && document.querySelectorAll('.leaflet-interactive').length>=10`);
    await screenshot('demo-desktop');
    await evaluate(`document.querySelector('button[aria-label="Filter by Waterlogging"]').click()`);
    await waitFor(`document.querySelectorAll('tbody tr').length===2`);
    await evaluate(`document.querySelector('.table-event').click()`);
    await waitFor(`!!document.querySelector('[role="dialog"]')`);
    assert.match(await evaluate(`document.querySelector('[role="dialog"]').innerText`), /Sample incident/);
    await evaluate(`document.querySelector('button[aria-label="Close dialog"]').click()`);
    await click('Reset filters');
    await waitFor(`document.querySelectorAll('tbody tr').length===12`);
    await click('Live map');
    await waitFor(`!!document.querySelector('.nearby-form')`);
    await click('Search area');
    await waitFor(`document.body.innerText.includes('Within 5 km')`);
    await click('Overview');
    await click('Reset filters');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await waitFor(`window.innerWidth===390`);
    assert.equal(await evaluate('document.documentElement.scrollWidth > window.innerWidth'), false, 'Mobile page must not overflow horizontally');
    await screenshot('demo-mobile');
    await click('Staff workspace');
    assert.equal(await evaluate(`document.querySelector('fieldset').disabled`), true, 'Demo staff mutations must be disabled');
    await click('Return to live data');
    await waitFor(`document.querySelector('.sidebar-health').textContent.includes('Backend connected') && !document.querySelector('.demo-banner')`);
    await evaluate(`document.querySelector('.account-button').click()`);
    await waitFor(`document.querySelector('[role="dialog"]')?.innerText.includes('Staff sign in')`);
    await screenshot('login-mobile');
    await evaluate(`document.querySelector('button[aria-label="Close dialog"]').click()`);
    await click('System status');
    await waitFor(`document.querySelector('.service-grid')?.innerText.includes('Connected')`);
    await screenshot('system-mobile');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1060, deviceScaleFactor: 1, mobile: false });
    if (process.env.CITYLENS_TEST_LOGIN_FILE) {
      assert.equal(base, 'http://localhost:3001', 'Staff writes are restricted to the disposable test preview');
      const login = JSON.parse(fs.readFileSync(process.env.CITYLENS_TEST_LOGIN_FILE, 'utf8'));
      await click('Staff workspace');
      await evaluate(`document.querySelector('.account-button').click()`);
      await fill('input[autocomplete="username"]', login.email);
      await fill('input[autocomplete="current-password"]', login.password);
      await click('Sign in');
      await waitFor(`document.body.innerText.includes('Welcome to your workspace') && !document.querySelector('[role="dialog"]')`);
      const vehicle = 'UI_BUS_' + Date.now();
      await fill('input[placeholder="e.g. BUS_001"]', vehicle);
      await click('Register vehicle');
      await waitFor(`document.body.innerText.includes(${JSON.stringify(vehicle + ' registered')})`);
      await fill('input[name="source_vehicle"]', vehicle);
      await fill('input[name="latitude"]', String(12 + Math.random()));
      await click('Save observation');
      await waitFor(`document.querySelector('#next-status') && !document.querySelector('#next-status').disabled`);
      await fill('#next-status', 'confirmed');
      await waitFor(`[...document.querySelectorAll('button')].some(x=>x.textContent==='Update status' && !x.disabled)`);
      await click('Update status');
      await waitFor(`document.querySelector('#next-status option[value="under_repair"]')`);
      await fill('input[aria-label="Assigned department"]', 'Browser verified roads');
      await click('Save assignment');
      await waitFor(`!document.querySelector('input[aria-label="Assigned department"]').disabled && [...document.querySelectorAll('button')].find(x=>x.textContent==='Save assignment')?.disabled`);
      await click('Load evidence');
      await waitFor(`document.body.innerText.includes('No evidence has been attached')`);
      await screenshot('staff-verified');
      const saved = await (await fetch(base + '/api/v1/events?q=Browser%20verified%20roads')).json();
      assert.equal(saved.total, 1); assert.equal(saved.items[0].status, 'confirmed');
      console.log('PASS: real staff login, registration, fleet, observation ingestion, status, department assignment, evidence, persisted global search.');
    } else {
      await click('Traffic AI');
      await waitFor(`!!document.querySelector('video')`);
      await waitFor(`document.querySelector('video').readyState>=2`);
      await evaluate(`(()=>{const video=document.querySelector('video');video.muted=true;return video.play()})()`);
      await waitFor(`document.querySelector('video').currentTime>0`);
      await screenshot('traffic-desktop');
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      assert.equal(await evaluate('document.documentElement.scrollWidth > window.innerWidth'), false);
      await screenshot('traffic-mobile');
      console.log('PASS: recorded Traffic AI data and browser video playback.');
    }
    assert.deepEqual(errors, [], 'No browser runtime exceptions');
    assert(streams.includes(101), 'Live WebSocket must complete its handshake through the frontend proxy');
    console.log('PASS: live API + WebSocket, demo isolation, filters, details, area search, responsive layout, staff guard, sign-in dialog, system status.');
  } finally { socket.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
