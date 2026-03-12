<?php
// Expire the session cookie immediately
setcookie('session', '', [
    'expires'  => time() - 3600,
    'path'     => '/',
    'secure'   => true,
    'httponly' => true,
    'samesite' => 'Strict',
]);
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="2; url=/login.html">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Logging out – Team Ate Analytics</title>
  <link rel="stylesheet" href="/analytics.css">
  <style>
    .logout-page {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 4rem var(--gap);
      gap: 1rem;
    }

    .logout-title {
      font-size: 1.4rem;
      font-weight: 700;
      color: var(--text);
      letter-spacing: -0.03em;
    }

    .logout-desc {
      font-size: 0.85rem;
      color: var(--text-muted);
      font-family: var(--font-mono);
    }

    .spinner {
      width: 28px;
      height: 28px;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>

  <header role="banner">
    <nav aria-label="Primary navigation">
      <a href="/index.html" class="wordmark">Team <strong>Ate</strong></a>
    </nav>
  </header>

  <main>
    <div class="logout-page">
      <div class="spinner"></div>
      <p class="logout-title">Logging out...</p>
      <p class="logout-desc">You'll be redirected to the login page shortly.</p>
    </div>
  </main>

  <footer role="contentinfo">
    <p>Connected to <abbr title="DigitalOcean Droplet">DO</abbr> / Apache / MySQL; Made with love by Team Ate (and Claude AI)</p>
  </footer>

</body>
</html>