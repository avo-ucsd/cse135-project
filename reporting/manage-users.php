<?php
$htgroup_file = '/etc/apache2/.htgroup';
$groups = [];

if (file_exists($htgroup_file)) {
    $lines = file($htgroup_file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos($line, ':') === false) continue;
        [$group, $users_str] = explode(':', $line, 2);
        $group = trim($group);
        $users = array_filter(array_map('trim', explode(' ', trim($users_str))));
        foreach ($users as $user) {
            $groups[$user] = $group;
        }
    }
}

// Sort users alphabetically
ksort($groups);
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Manage Users – Team Ate Analytics</title>
  <link rel="stylesheet" href="analytics.css">
  <style>
    .user-table td:first-child { color: var(--text); }

    .badge {
      display: inline-block;
      font-size: 0.68rem;
      font-family: var(--font-mono);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 0.2rem 0.55rem;
      border-radius: 4px;
      font-weight: 600;
    }
    .badge-superadmin {
      background: rgba(185, 79, 247, 0.15);
      color: var(--accent);
      border: 1px solid rgba(185, 79, 247, 0.3);
    }

    .badge-analyst {
      background: rgba(248, 180, 0, 0.1);
      color: #f8b400;
      border: 1px solid rgba(248, 180, 0, 0.25);
    }

    .badge-viewer {
      background: rgba(52, 211, 153, 0.1);
      color: var(--positive);
      border: 1px solid rgba(52, 211, 153, 0.25);
    }
  </style>
</head>
<body>

  <header role="banner">
    <nav aria-label="Primary navigation">
      <a href="index.html" class="wordmark">Team <strong>Ate</strong></a>
      <ul role="list">
        <li><a href="index.html">Dashboard</a></li>
        <li><a href="raw.html">Raw Data</a></li>
        <li><a href="manage-users.php" aria-current="page">Manage Users</a></li>
      </ul>
      <form method="post" action="/logout" class="logout-form">
        <button type="submit" class="btn-logout">Log out</button>
      </form>
    </nav>
  </header>

  <main>
    <section class="page-header">
      <hgroup>
        <p class="eyebrow">Admin</p>
        <h1>Manage Users</h1>
      </hgroup>
    </section>

    <section class="table-section">
      <header class="section-header">
        <h2>All Users</h2>
      </header>
      <figure>
        <table class="user-table">
          <caption class="sr-only">User list with roles</caption>
          <thead>
            <tr>
              <th scope="col">Username</th>
              <th scope="col">Role</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            <?php if (empty($groups)): ?>
            <tr><td colspan="3" style="color:var(--text-muted);text-align:center;">No users found in <?= htmlspecialchars($htgroup_file) ?></td></tr>
            <?php else: ?>
            <?php foreach ($groups as $username => $group): ?>
            <tr>
              <td><?= htmlspecialchars($username) ?></td>
              <td><span class="badge badge-<?= htmlspecialchars($group) ?>"><?= htmlspecialchars($group) ?></span></td>
              <td>—</td>
            </tr>
            <?php endforeach; ?>
            <?php endif; ?>
          </tbody>
        </table>
      </figure>
    </section>
  </main>

  <footer role="contentinfo">
    <p>Connected to <abbr title="DigitalOcean Droplet">DO</abbr> / Apache / MySQL; Made with love by Team Ate (and Claude AI)</p>
  </footer>

</body>
</html>