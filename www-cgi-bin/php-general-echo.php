#!/usr/bin/php-cgi
<?php
header("Cache-Control: no-cache");
header("Content-Type: text/html; charset=utf-8");

echo "<!DOCTYPE html>";
echo "<html><head><title>General Echo (PHP)</title></head><body>";
echo "<h1 align=\"center\">General Request Echo (PHP)</h1><hr>";

$hostName      = $_SERVER['HTTP_HOST']         ?? "(null)";
$userAgent     = $_SERVER['HTTP_USER_AGENT']   ?? "(null)";
$clientIP      = $_SERVER['REMOTE_ADDR']       ?? "(null)";
$requestMethod = $_SERVER['REQUEST_METHOD']    ?? "(null)";
$queryString   = $_SERVER['QUERY_STRING']      ?? "";
$protocol      = $_SERVER['SERVER_PROTOCOL']   ?? "(null)";

$body = "(null)";
if ($requestMethod !== "GET") {
    $contentLength = $_SERVER['CONTENT_LENGTH'] ?? 0;
    if ($contentLength > 0) {
        $body = file_get_contents("php://input");
    } else {
        $body = "";
    }
} else {
    $body = "";
}

$time = date("r"); 

echo "<table><tbody>";

echo "<tr><td><b>HTTP Protocol:</b></td><td>$protocol</td></tr>";
echo "<tr><td><b>HTTP Method:</b></td><td>$requestMethod</td></tr>";
echo "<tr><td><b>Host Name:</b></td><td>$hostName</td></tr>";
echo "<tr><td><b>Query String:</b></td><td>$queryString</td></tr>";
echo "<tr><td><b>Message Body:</b></td><td>$body</td></tr>";
echo "<tr><td><b>Time:</b></td><td>$time</td></tr>";
echo "<tr><td><b>User Agent Header:</b></td><td>$userAgent</td></tr>";
echo "<tr><td><b>IP Address:</b></td><td>$clientIP</td></tr>";

echo "</tbody></table>";

echo "</body></html>";