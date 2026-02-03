<?php

$SESSION_DIR = "/tmp/cpp_sessions/";

function getSessionId() {
    if (!isset($_SERVER['HTTP_COOKIE'])) return "";

    $cookies = explode("; ", $_SERVER['HTTP_COOKIE']);
    foreach ($cookies as $cookie) {
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

$sessionId = getSessionId();
$username = getUsername($sessionId);

header("Cache-Control: no-cache");
header("Content-Type: text/html; charset=utf-8");

echo "<!DOCTYPE html>";
echo "<html>";
echo "<head><title>PHP Sessions (2)</title></head>";
echo "<body>";
echo "<h1 align=\"center\">PHP Sessions (Page 2)</h1><hr/>";

echo "<section style=\"margin: auto; padding: 1rem; width: 50vw\">";
echo "<p>Hello! This is sessions with PHP. You are on <strong>page 2</strong>.</p>";

if ($username === "") {
    echo "<p>You do <strong>not</strong> have a name yet.</p>";
} else {
    echo "<p>Hello, <strong>$username</strong>!</p>";
}

echo "<ul>";
echo "<li><a href=\"/cgi-bin/php-cgi-form.php\">PHP CGI Form</a></li>";
echo "<li><a href=\"/cgi-bin/php-sessions-1.php\">Session Page 1</a></li>";
echo "<li><a href=\"/\">Back to Team Ate home</a></li>";
echo "</ul>";

echo "<form action=\"/cgi-bin/php-destroy-session.php\" method=\"get\">";
echo "<button type=\"submit\">Destroy Session</button>";
echo "</form>";

echo "</section>";
echo "</body></html>";