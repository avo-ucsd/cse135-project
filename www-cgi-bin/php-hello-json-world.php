<?php
header("Cache-Control: no-cache");
header("Content-Type: application/json; charset=utf-8");

$timestamp = date("r");

$clientIP = $_SERVER['REMOTE_ADDR'] ?? "(null)";

$response = [
    "title" => "Hello CGI World! (PHP)",
    "message" => "Hello World!",
    "teammates_quote" => "Why would you willingly want to program in PHP?",
    "language" => "PHP",
    "generated_at" => $timestamp,
    "ip_address" => $clientIP
];

echo json_encode($response, JSON_PRETTY_PRINT);