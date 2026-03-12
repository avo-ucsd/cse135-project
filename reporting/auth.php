<?php
// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit;
}

$username = $_POST['httpd_username'] ?? '';
$password = $_POST['httpd_password'] ?? '';

if (empty($username) || empty($password)) {
    header('Location: /login.php?failed=1');
    exit;
}

// Forward credentials to Apache's j_security_check internally
$ch = curl_init('https://localhost/j_security_check');
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => http_build_query([
        'httpd_username' => $username,
        'httpd_password' => $password,
    ]),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_HEADER         => true,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => false,
    CURLOPT_HTTPHEADER     => [
        'Host: reporting.teamate.site',
    ],
    CURLOPT_COOKIE         => $_SERVER['HTTP_COOKIE'] ?? '',
]);

$response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$header_size = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$headers = substr($response, 0, $header_size);
curl_close($ch);

// Forward any Set-Cookie headers from Apache to the browser
// foreach (explode("\r\n", $headers) as $header) {
//     if (stripos($header, 'Set-Cookie:') === 0) {
//         header($header, false);
//     }
// }

// // Apache returns 302 on success, anything else is a failure
// if ($http_code === 302) {
//     header('Location: /index.html');
// } else {
//     header('Location: /login.php?failed=1');
// }
// exit;
curl_close($ch);

// Forward any Set-Cookie headers from Apache to the browser
foreach (explode("\r\n", $headers) as $header) {
    if (stripos($header, 'Set-Cookie:') === 0) {
        header($header, false);
    }
}

if ($http_code === 302) {
    // Check where Apache is redirecting to
    preg_match('/^Location: (.+)$/im', $headers, $matches);
    $redirect = isset($matches[1]) ? trim($matches[1]) : '/index.html';
    
    // If Apache redirects to login, credentials were wrong
    if (strpos($redirect, 'login') !== false) {
        header('Location: /login.php?failed=1');
    } else {
        header('Location: /index.html');
    }
} else {
    header('Location: /login.php?failed=1');
}
exit;