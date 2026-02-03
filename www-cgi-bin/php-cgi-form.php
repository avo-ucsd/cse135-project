<?php

$SESSION_DIR = "/tmp/cpp_sessions/";

function getSessionId() {
    if (!isset($_SERVER['HTTP_COOKIE'])) return "";

    $cookies = $_SERVER['HTTP_COOKIE'];
    foreach (explode("; ", $cookies) as $cookie) {
        if (str_starts_with($cookie, "CGISESSID=")) {
            return substr($cookie, strlen("CGISESSID="));
        }
    }
    return "";
}

function getUsername($sessionId) {
    global $SESSION_DIR;
    if ($sessionId === "") return "";

    $path = $SESSION_DIR . $sessionId;
    if (!file_exists($path)) return "";

    return trim(file_get_contents($path));
}

function generateSessionId() {
    return time() . rand();
}

function getSubmittedUsername() {
    if (!isset($_SERVER['QUERY_STRING'])) return "";

    parse_str($_SERVER['QUERY_STRING'], $params);
    return $params['username'] ?? "";
}

$sessionId = getSessionId();
$existingUsername = getUsername($sessionId);
$submittedUsername = getSubmittedUsername();

if ($submittedUsername !== "" && $existingUsername === "") {

    if (!is_dir($SESSION_DIR)) {
        mkdir($SESSION_DIR, 0777, true);
    }

    $sessionId = generateSessionId();
    file_put_contents($SESSION_DIR . $sessionId, $submittedUsername);

    $existingUsername = $submittedUsername;

    header("Set-Cookie: CGISESSID=$sessionId; Path=/");
}

header("Cache-Control: no-cache");
header("Content-Type: text/html; charset=utf-8");

echo "<!DOCTYPE html>";
echo "<html><head><title>PHP CGI Form</title></head>";
echo "<body>";
echo "<h1 align=\"center\">PHP CGI Form</h1><hr/>";
echo "<section style=\"margin: auto; padding: 1rem; width: 50vw\">";

if ($existingUsername !== "") {
    echo "<p>You already have a session with the name: <strong>$existingUsername</strong></p>";
    echo "<p>Please destroy your current session before creating a new one.</p>";
    echo "<form action=\"/cgi-bin/php-destroy-session.php\" method=\"get\">";
    echo "<button type=\"submit\">Destroy Session</button>";
    echo "</form>";

} else {
    echo "<form action=\"/cgi-bin/php-cgi-form.php\" method=\"get\">";
    echo "<label for=\"username\">Enter your name:</label><br/>";
    echo "<input type=\"text\" id=\"username\" name=\"username\" required><br/><br/>";
    echo "<button type=\"submit\">Create Session</button>";
    echo "</form>";
}

echo "<br/>";
echo "<ul>";
echo "<li><a href=\"/cgi-bin/php-sessions-1.php\">Session Page 1</a></li>";
echo "<li><a href=\"/cgi-bin/php-sessions-2.php\">Session Page 2</a></li>";
echo "<li><a href=\"/\">Back to Team Ate home</a></li>";
echo "</ul>";

echo "</section>";
echo "</body></html>";