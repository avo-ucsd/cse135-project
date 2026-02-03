<?php
header("Cache-Control: no-cache");
header("Content-Type: text/html; charset=utf-8");

$timestamp = date("r"); 

$clientIP = $_SERVER['REMOTE_ADDR'] ?? null;

echo "<!DOCTYPE html>";
echo "<html>";
echo "<head>";
echo "<title> Hello CGI World! (PHP)</title>";
echo "</head>";

echo "<body>";
echo "<h1 align=center>Hello HTML World</h1><hr/>";
echo "<p>Hello World!</p>";

echo "<figure>";
echo     "<figcaption><b>My teammates:</b></figcaption>";
echo     "<blockquote>";
echo         "\"Why would you willingly want to program in PHP?\"";
echo     "</blockquote>";
echo "</figure>";

echo "<p>This page was generated with the PHP programming language </p>";

echo "<p>This program was generated at: $timestamp</p>";

if ($clientIP) {
    echo "<p>Your current IP address is: $clientIP</p>";
} else {
    echo "<p>There was an error with finding your IP address. :(</p>";
}

echo "</body>";
echo "</html>";