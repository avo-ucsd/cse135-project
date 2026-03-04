<?php
/**
 * collector.teamate.site — /log endpoint
 *
 * Receives JSON payloads POSTed by collector.js (via sendBeacon or fetch),
 * validates them, and inserts a row into MySQL.
 *
 * File location on server:  /var/www/collector/log.php
 * Apache routes /log → log.php via .htaccess (included separately)
 *
 * Requirements:
 *   - PHP with PDO + pdo_mysql extension (usually pre-installed)
 *   - MySQL database and table created via schema.sql
 */

// ── CORS ──────────────────────────────────────────────────────────────────────
// sendBeacon is cross-origin (teamate.site → collector.teamate.site),
// so we must explicitly allow our own domains.
// $allowed_origins = [
//     'https://teamate.site',
//     'https://www.teamate.site',
//     'https://test.teamate.site',
// ];

// $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
// if (in_array($origin, $allowed_origins, true)) {
//     header("Access-Control-Allow-Origin: $origin");
// }
// header('Access-Control-Allow-Methods: POST, OPTIONS');
// header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');
// header('Vary: Origin');

// Handle OPTIONS preflight (browsers send this before cross-origin POST)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Only accept POST ──────────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method Not Allowed']);
    exit;
}

// ── Read + decode request body ────────────────────────────────────────────────
$raw = file_get_contents('php://input');
if (empty($raw)) {
    http_response_code(400);
    echo json_encode(['error' => 'Empty body']);
    exit;
}

$data = json_decode($raw, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON: ' . json_last_error_msg()]);
    exit;
}

// ── Database credentials ──────────────────────────────────────────────────────
// Change these to match your MySQL setup.
define('DB_HOST', 'localhost');
define('DB_PORT', '3306');
define('DB_NAME', 'collector_db');                      // your database name
define('DB_USER', 'collector_user');                    // your MySQL user
define('DB_PASS', 'JoeCollectsSalmonBurrito135');       // your MySQL password

// ── Connect ───────────────────────────────────────────────────────────────────
try {
    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
        DB_HOST, DB_PORT, DB_NAME);

    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4",
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'DB connection failed']);
    // Log the real error server-side only — never expose it to the client
    error_log('[collector/log] DB connect error: ' . $e->getMessage());
    exit;
}

// ── Helper: safely pull a nested value ───────────────────────────────────────
function get(array $arr, ...$keys) {
    $cur = $arr;
    foreach ($keys as $key) {
        if (!is_array($cur) || !array_key_exists($key, $cur)) return null;
        $cur = $cur[$key];
    }
    return $cur;
}

// Helper: convert ISO 8601 string to MySQL DATETIME (or null)
function toDatetime(?string $iso): ?string {
    if (!$iso) return null;
    try {
        $dt = new DateTime($iso);
        return $dt->format('Y-m-d H:i:s');
    } catch (Exception $e) {
        return null;
    }
}

// ── Extract fields from payload ───────────────────────────────────────────────
$tech   = $data['technographics'] ?? [];
$net    = $tech['network']        ?? [];
$timing = $data['timing']         ?? [];
$vitals = $data['vitals']         ?? [];
$lc     = $data['pageLifecycle']  ?? [];
$mouse  = $data['mouse']          ?? [];
$kb     = $data['keyboard']       ?? [];
$idle   = $data['idle']           ?? [];

// ── INSERT ────────────────────────────────────────────────────────────────────
$sql = "
INSERT INTO pageviews (
    event_type, url, title, referrer, client_timestamp, session_id, error_count,

    user_agent, language, cookies_enabled,
    viewport_width, viewport_height,
    screen_width, screen_height, pixel_ratio,
    network_effective_type, network_downlink, network_rtt, network_save_data,

    timing_dns, timing_tcp, timing_tls, timing_ttfb, timing_download,
    timing_dom_interactive, timing_dom_complete, timing_load_event,

    vital_lcp, vital_cls, vital_inp,

    page_entered_at, page_left_at, page_left_reason, entry_url,

    mouse_total_moves, mouse_total_clicks, mouse_total_scrolls,
    keyboard_total_keydown, keyboard_total_keyup,
    idle_total_count, idle_total_duration_ms,

    mouse_data, keyboard_data, idle_data, resources_data,
    raw_payload
) VALUES (
    :event_type, :url, :title, :referrer, :client_timestamp, :session_id, :error_count,

    :user_agent, :language, :cookies_enabled,
    :viewport_width, :viewport_height,
    :screen_width, :screen_height, :pixel_ratio,
    :network_effective_type, :network_downlink, :network_rtt, :network_save_data,

    :timing_dns, :timing_tcp, :timing_tls, :timing_ttfb, :timing_download,
    :timing_dom_interactive, :timing_dom_complete, :timing_load_event,

    :vital_lcp, :vital_cls, :vital_inp,

    :page_entered_at, :page_left_at, :page_left_reason, :entry_url,

    :mouse_total_moves, :mouse_total_clicks, :mouse_total_scrolls,
    :keyboard_total_keydown, :keyboard_total_keyup,
    :idle_total_count, :idle_total_duration_ms,

    :mouse_data, :keyboard_data, :idle_data, :resources_data,
    :raw_payload
)
";

try {
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':event_type'             => $data['type']      ?? 'pageview',
        ':url'                    => $data['url']        ?? null,
        ':title'                  => $data['title']      ?? null,
        ':referrer'               => $data['referrer']   ?? null,
        ':client_timestamp'       => toDatetime($data['timestamp'] ?? null),
        ':session_id'             => $data['session']    ?? null,
        ':error_count'            => $data['errorCount'] ?? 0,

        ':user_agent'             => $tech['userAgent']    ?? null,
        ':language'               => $tech['language']     ?? null,
        ':cookies_enabled'        => isset($tech['cookiesEnabled']) ? (int)$tech['cookiesEnabled'] : null,
        ':viewport_width'         => $tech['viewportWidth']  ?? null,
        ':viewport_height'        => $tech['viewportHeight'] ?? null,
        ':screen_width'           => $tech['screenWidth']    ?? null,
        ':screen_height'          => $tech['screenHeight']   ?? null,
        ':pixel_ratio'            => $tech['pixelRatio']     ?? null,

        ':network_effective_type' => $net['effectiveType'] ?? null,
        ':network_downlink'       => $net['downlink']       ?? null,
        ':network_rtt'            => $net['rtt']            ?? null,
        ':network_save_data'      => isset($net['saveData']) ? (int)$net['saveData'] : null,

        ':timing_dns'             => $timing['dnsLookup']      ?? null,
        ':timing_tcp'             => $timing['tcpConnect']      ?? null,
        ':timing_tls'             => $timing['tlsHandshake']    ?? null,
        ':timing_ttfb'            => $timing['ttfb']            ?? null,
        ':timing_download'        => $timing['download']        ?? null,
        ':timing_dom_interactive' => $timing['domInteractive']  ?? null,
        ':timing_dom_complete'    => $timing['domComplete']     ?? null,
        ':timing_load_event'      => $timing['loadEvent']       ?? null,

        ':vital_lcp'              => $vitals['lcp'] ?? null,
        ':vital_cls'              => $vitals['cls'] ?? null,
        ':vital_inp'              => $vitals['inp'] ?? null,

        ':page_entered_at'        => toDatetime($lc['enteredAt'] ?? null),
        ':page_left_at'           => toDatetime($lc['leftAt']    ?? null),
        ':page_left_reason'       => $lc['leftReason'] ?? null,
        ':entry_url'              => $lc['entryUrl']   ?? null,

        ':mouse_total_moves'      => get($mouse, 'totals', 'moves')   ?? 0,
        ':mouse_total_clicks'     => get($mouse, 'totals', 'clicks')  ?? 0,
        ':mouse_total_scrolls'    => get($mouse, 'totals', 'scrolls') ?? 0,
        ':keyboard_total_keydown' => get($kb, 'totals', 'keydown')    ?? 0,
        ':keyboard_total_keyup'   => get($kb, 'totals', 'keyup')      ?? 0,
        ':idle_total_count'       => get($idle, 'totals', 'count')          ?? 0,
        ':idle_total_duration_ms' => get($idle, 'totals', 'totalDurationMs') ?? 0,

        // Store full nested objects as JSON strings
        ':mouse_data'             => json_encode($mouse),
        ':keyboard_data'          => json_encode($kb),
        ':idle_data'              => json_encode($idle),
        ':resources_data'         => json_encode($data['resources'] ?? null),

        // Full raw payload for debugging
        ':raw_payload'            => $raw,
    ]);

    http_response_code(200);
    echo json_encode(['status' => 'ok', 'id' => $pdo->lastInsertId()]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Insert failed']);
    error_log('[collector/log] Insert error: ' . $e->getMessage());
}