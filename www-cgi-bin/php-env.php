<?php
header("Cache-Control: no-cache");
header("Content-Type: text/html; charset=utf-8");

echo "<!DOCTYPE html>";
echo "<html>";
echo "<head>";
echo "<title>Environment Variables (PHP)</title>";
echo "</head>";
echo "<body>";
echo "<h1 align=\"center\">Environment Variables (PHP Edition)</h1>";
echo "<hr>";

foreach ($_SERVER as $key => $value) {
    echo "<p>{$key}={$value}</p>";
}

echo "</body>";
echo "</html>";