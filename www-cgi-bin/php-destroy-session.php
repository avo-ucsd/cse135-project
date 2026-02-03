#!/usr/bin/php-cgi
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

$sessionId = getSessionId();

if ($sessionId !== "") {
    $filePath = $SESSION_DIR . $sessionId;
    if (file_exists($filePath)) {
        unlink($filePath);
    }
}

header("Set-Cookie: CGISESSID=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT");
header("Cache-Control: no-cache");
header("Content-Type: text/html; charset=utf-8");

echo "<!DOCTYPE html>";
echo "<html>";
echo "<head><title>Session Destroyed</title></head>";
echo "<body>";
echo "<h1 align=\"center\">Session Destroyed</h1><hr/>";

echo "<section style=\"margin: auto; padding: 1rem; width: 50vw\">";
echo "<p>Your session has been successfully destroyed.</p>";
echo "<ul>";
echo "<li><a href=\"/cgi-bin/php-cgi-form.php\">PHP CGI Form</a></li>";
echo "<li><a href=\"/cgi-bin/php-sessions-1.php\">Session Page 1</a></li>";
echo "<li><a href=\"/cgi-bin/php-sessions-2.php\">Session Page 2</a></li>";
echo "<li><a href=\"/\">Back to Team Ate home</a></li>";
echo "</ul>";
echo "</section>";

echo "</body></html>";