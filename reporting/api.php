<?php
/**
 * REST API for analytics reporting
 * Deploy on your reporting vhost (e.g. report.teamate.site)
 *
 * Routes supported:
 *   GET    /api/pageviews           - All pageview records
 *   GET    /api/pageviews/{id}      - Single pageview by ID
 *   POST   /api/pageviews           - Insert a new pageview record
 *   PUT    /api/pageviews/{id}      - Update a pageview record
 *   DELETE /api/pageviews/{id}      - Delete a pageview record
 *
 *   GET    /api/sessions            - All unique sessions (aggregated)
 *   GET    /api/sessions/{id}       - All pageviews for a session_id
 *
 *   GET    /api/vitals              - All web vitals records
 *   GET    /api/vitals/{id}         - Single vitals row by pageview ID
 *
 *   GET    /api/errors              - All rows where error_count > 0
 *   GET    /api/errors/{id}         - Single error row by pageview ID
 *
 *   GET    /api/technographics      - All technographic data
 *   GET    /api/technographics/{id} - Single technographic row by pageview ID
 */

// ── CORS ──────────────────────────────────────────────────────────────────────
// $allowed_origins = [
//     'https://teamate.site',
//     'https://www.teamate.site',
//     'https://test.teamate.site',
//     'https://report.teamate.site',
// ];

// $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
// if (in_array($origin, $allowed_origins, true)) {
//     header("Access-Control-Allow-Origin: $origin");
// }

// header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
// header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json');
// header('Vary: Origin');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── DB credentials (same DB as collector) ────────────────────────────────────
define('DB_HOST', 'localhost');
define('DB_PORT', '3306');
define('DB_NAME', 'collector_db');
define('DB_USER', 'collector_user');
define('DB_PASS', 'JoeCollectsSalmonBurrito135'); 

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
    error_log('[api] DB connect: ' . $e->getMessage());
    exit;
}

// ── Router ────────────────────────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];

// Strip query string and leading /api from PATH_INFO or REQUEST_URI
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$uri = preg_replace('#^/api#', '', $uri);   // remove /api prefix
$uri = rtrim($uri, '/');                    // remove trailing slash

// Match /resource  or  /resource/{id}
if (!preg_match('#^/([a-z]+)(?:/([^/]+))?$#', $uri, $m)) {
    http_response_code(404);
    echo json_encode(['error' => 'Not Found']);
    exit;
}

$resource = $m[1];              // e.g. "pageviews"
$id       = $m[2] ?? null;      // e.g. "42", or null

// ── Helpers ───────────────────────────────────────────────────────────────────
function respond(int $code, mixed $data): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function readBody(): array {
    $raw = file_get_contents('php://input');
    if (empty($raw)) return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function requireId(?string $id): string {
    if ($id === null || !ctype_digit($id)) {
        respond(400, ['error' => 'A numeric ID is required for this method']);
    }
    return $id;
}

function forbidId(?string $id): void {
    if ($id !== null) {
        respond(400, ['error' => 'Do not supply an ID for POST requests']);
    }
}

// ── Route dispatch ────────────────────────────────────────────────────────────
switch ($resource) {

    // ── /api/pageviews ────────────────────────────────────────────────────────
    case 'pageviews':
        switch ($method) {

            case 'GET':
                if ($id === null) {
                    // GET /api/pageviews  — return all, most recent first
                    $limit = min((int)($_GET['limit'] ?? 100), 1000);
                    $offset = (int)($_GET['offset'] ?? 0);
                    $stmt = $pdo->prepare("
                        SELECT id, received_at, event_type, url, title, referrer,
                               client_timestamp, session_id, error_count,
                               user_agent, language, viewport_width, viewport_height,
                               screen_width, screen_height, pixel_ratio,
                               network_effective_type, network_downlink, network_rtt,
                               timing_ttfb, timing_dom_complete, timing_load_event,
                               vital_lcp, vital_cls, vital_inp,
                               page_entered_at, page_left_at, page_left_reason,
                               mouse_total_moves, mouse_total_clicks, mouse_total_scrolls,
                               keyboard_total_keydown, keyboard_total_keyup,
                               idle_total_count, idle_total_duration_ms
                        FROM pageviews
                        ORDER BY id DESC
                        LIMIT :limit OFFSET :offset
                    ");
                    $stmt->bindValue(':limit',  $limit,  PDO::PARAM_INT);
                    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
                    $stmt->execute();
                    $rows = $stmt->fetchAll();

                    $count = $pdo->query("SELECT COUNT(*) FROM pageviews")->fetchColumn();
                    respond(200, ['total' => (int)$count, 'limit' => $limit, 'offset' => $offset, 'data' => $rows]);
                } else {
                    // GET /api/pageviews/{id}
                    $stmt = $pdo->prepare("SELECT * FROM pageviews WHERE id = :id");
                    $stmt->execute([':id' => $id]);
                    $row = $stmt->fetch();
                    if (!$row) respond(404, ['error' => "Pageview #$id not found"]);
                    respond(200, $row);
                }
                break;

            case 'POST':
                // POST /api/pageviews  — create a new record manually
                forbidId($id);
                $b = readBody();
                if (empty($b)) respond(400, ['error' => 'Request body is empty or invalid JSON']);

                $stmt = $pdo->prepare("
                    INSERT INTO pageviews (event_type, url, title, referrer, client_timestamp, session_id)
                    VALUES (:event_type, :url, :title, :referrer, :client_timestamp, :session_id)
                ");
                $stmt->execute([
                    ':event_type'       => $b['event_type']       ?? 'pageview',
                    ':url'              => $b['url']              ?? null,
                    ':title'            => $b['title']            ?? null,
                    ':referrer'         => $b['referrer']         ?? null,
                    ':client_timestamp' => $b['client_timestamp'] ?? null,
                    ':session_id'       => $b['session_id']       ?? null,
                ]);
                respond(201, ['status' => 'created', 'id' => (int)$pdo->lastInsertId()]);
                break;

            case 'PUT':
                // PUT /api/pageviews/{id}  — update selected fields
                requireId($id);
                $b = readBody();
                if (empty($b)) respond(400, ['error' => 'Request body is empty or invalid JSON']);

                // Build dynamic SET clause from allowed fields only
                $allowed = ['event_type','url','title','referrer','client_timestamp',
                            'session_id','error_count','page_left_reason'];
                $sets = [];
                $params = [':id' => $id];
                foreach ($allowed as $col) {
                    if (array_key_exists($col, $b)) {
                        $sets[] = "$col = :$col";
                        $params[":$col"] = $b[$col];
                    }
                }
                if (empty($sets)) respond(400, ['error' => 'No updatable fields provided']);

                $sql = "UPDATE pageviews SET " . implode(', ', $sets) . " WHERE id = :id";
                $stmt = $pdo->prepare($sql);
                $stmt->execute($params);
                if ($stmt->rowCount() === 0) respond(404, ['error' => "Pageview #$id not found or no change"]);
                respond(200, ['status' => 'updated', 'id' => (int)$id]);
                break;

            case 'DELETE':
                // DELETE /api/pageviews/{id}
                requireId($id);
                $stmt = $pdo->prepare("DELETE FROM pageviews WHERE id = :id");
                $stmt->execute([':id' => $id]);
                if ($stmt->rowCount() === 0) respond(404, ['error' => "Pageview #$id not found"]);
                respond(200, ['status' => 'deleted', 'id' => (int)$id]);
                break;

            default:
                respond(405, ['error' => 'Method Not Allowed']);
        }
        break;

    // ── /api/sessions ─────────────────────────────────────────────────────────
    case 'sessions':
        if ($method !== 'GET') respond(405, ['error' => 'Method Not Allowed']);

        if ($id === null) {
            // GET /api/sessions  — aggregate one row per session_id
            $stmt = $pdo->query("
                SELECT session_id,
                       COUNT(*)                             AS pageview_count,
                       MIN(page_entered_at)                 AS session_start,
                       MAX(COALESCE(page_left_at, page_entered_at)) AS session_end,
                       MIN(url)                             AS first_url,
                       MAX(user_agent)                      AS user_agent,
                       MAX(language)                        AS language,
                       SUM(error_count)                     AS total_errors,
                       SUM(mouse_total_clicks)              AS total_clicks
                FROM pageviews
                GROUP BY session_id
                ORDER BY session_start DESC
                LIMIT 200
            ");
            respond(200, ['data' => $stmt->fetchAll()]);
        } else {
            // GET /api/sessions/{session_id}  — all pageviews for that session
            $stmt = $pdo->prepare("
                SELECT id, url, title, page_entered_at, page_left_at, page_left_reason,
                       vital_lcp, vital_cls, vital_inp,
                       mouse_total_moves, mouse_total_clicks, keyboard_total_keydown
                FROM pageviews
                WHERE session_id = :sid
                ORDER BY page_entered_at ASC
            ");
            $stmt->execute([':sid' => $id]);
            $rows = $stmt->fetchAll();
            if (!$rows) respond(404, ['error' => "Session '$id' not found"]);
            respond(200, ['session_id' => $id, 'data' => $rows]);
        }
        break;

    // ── /api/vitals ───────────────────────────────────────────────────────────
    case 'vitals':
        if ($method !== 'GET') respond(405, ['error' => 'Method Not Allowed']);

        if ($id === null) {
            // GET /api/vitals  — all rows that have at least one vital recorded
            $stmt = $pdo->query("
                SELECT id, url, title, client_timestamp, session_id,
                       vital_lcp, vital_cls, vital_inp
                FROM pageviews
                WHERE vital_lcp IS NOT NULL
                   OR vital_cls IS NOT NULL
                   OR vital_inp IS NOT NULL
                ORDER BY id DESC
                LIMIT 500
            ");
            respond(200, ['data' => $stmt->fetchAll()]);
        } else {
            // GET /api/vitals/{id}  — vitals for a specific pageview ID
            $stmt = $pdo->prepare("
                SELECT id, url, title, client_timestamp, session_id,
                       vital_lcp, vital_cls, vital_inp
                FROM pageviews WHERE id = :id
            ");
            $stmt->execute([':id' => $id]);
            $row = $stmt->fetch();
            if (!$row) respond(404, ['error' => "Vitals for pageview #$id not found"]);
            respond(200, $row);
        }
        break;

    // ── /api/errors ───────────────────────────────────────────────────────────
    case 'errors':
        if ($method !== 'GET') respond(405, ['error' => 'Method Not Allowed']);

        if ($id === null) {
            // GET /api/errors  — all rows where errors were logged
            $stmt = $pdo->query("
                SELECT id, url, title, client_timestamp, session_id,
                       error_count, raw_payload
                FROM pageviews
                WHERE error_count > 0
                ORDER BY id DESC
                LIMIT 500
            ");
            respond(200, ['data' => $stmt->fetchAll()]);
        } else {
            // GET /api/errors/{id}
            $stmt = $pdo->prepare("
                SELECT id, url, title, client_timestamp, session_id,
                       error_count, raw_payload
                FROM pageviews WHERE id = :id AND error_count > 0
            ");
            $stmt->execute([':id' => $id]);
            $row = $stmt->fetch();
            if (!$row) respond(404, ['error' => "Error row for pageview #$id not found"]);
            respond(200, $row);
        }
        break;

    // ── /api/technographics ───────────────────────────────────────────────────
    case 'technographics':
        if ($method !== 'GET') respond(405, ['error' => 'Method Not Allowed']);

        if ($id === null) {
            // GET /api/technographics  — browser/device fingerprint data
            $stmt = $pdo->query("
                SELECT id, client_timestamp, session_id,
                       user_agent, language, cookies_enabled,
                       viewport_width, viewport_height,
                       screen_width, screen_height, pixel_ratio,
                       network_effective_type, network_downlink,
                       network_rtt, network_save_data
                FROM pageviews
                ORDER BY id DESC
                LIMIT 500
            ");
            respond(200, ['data' => $stmt->fetchAll()]);
        } else {
            // GET /api/technographics/{id}
            $stmt = $pdo->prepare("
                SELECT id, client_timestamp, session_id,
                       user_agent, language, cookies_enabled,
                       viewport_width, viewport_height,
                       screen_width, screen_height, pixel_ratio,
                       network_effective_type, network_downlink,
                       network_rtt, network_save_data
                FROM pageviews WHERE id = :id
            ");
            $stmt->execute([':id' => $id]);
            $row = $stmt->fetch();
            if (!$row) respond(404, ['error' => "Technographics for pageview #$id not found"]);
            respond(200, $row);
        }
        break;

    default:
        respond(404, ['error' => "Unknown resource '$resource'"]);
}