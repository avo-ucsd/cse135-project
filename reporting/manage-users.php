<?php
$htgroup_file = '/etc/apache2/.htgroup';
$groups = [];       // username -> group
$all_groups = [];   // list of all group names

// --- Read .htgroup ---
if (file_exists($htgroup_file)) {
    $lines = file($htgroup_file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos($line, ':') === false) continue;
        [$group, $users_str] = explode(':', $line, 2);
        $group = trim($group);
        $all_groups[] = $group;
        $users = array_filter(array_map('trim', explode(' ', trim($users_str))));
        foreach ($users as $user) {
            $groups[$user] = $group;
        }
    }
}
ksort($groups);

// --- Handle form submission ---
$success_msg = '';
$error_msg   = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['roles'])) {
    $new_assignments = $_POST['roles']; // username -> new_group
    $updated_groups  = $groups;

    foreach ($new_assignments as $username => $new_group) {
        $username  = trim($username);
        $new_group = trim($new_group);

        // Superadmins cannot be changed
        if (isset($groups[$username]) && $groups[$username] === 'superadmin') continue;

        // Validate group exists
        if (!in_array($new_group, $all_groups)) continue;

        $updated_groups[$username] = $new_group;
    }

    // Rebuild .htgroup file grouped by role
    $by_group = [];
    foreach ($updated_groups as $user => $grp) {
        $by_group[$grp][] = $user;
    }
    $lines_out = [];
    foreach ($all_groups as $grp) {
        $members = isset($by_group[$grp]) ? implode(' ', $by_group[$grp]) : '';
        $lines_out[] = "$grp: $members";
    }

    if (file_put_contents($htgroup_file, implode("\n", $lines_out) . "\n") !== false) {
        $groups = $updated_groups;
        ksort($groups);
        $success_msg = 'Changes saved successfully.';
    } else {
        $error_msg = 'Failed to write to ' . $htgroup_file . '. Check file permissions.';
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Manage Users – Team Ate Analytics</title>
  <link rel="stylesheet" href="analytics.css">
  <script src="/components/Header.js" defer></script>
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
    .badge-viewer {
      background: rgba(52, 211, 153, 0.1);
      color: var(--positive);
      border: 1px solid rgba(52, 211, 153, 0.25);
    }
    .badge-analyst {
      background: rgba(248, 180, 0, 0.1);
      color: #f8b400;
      border: 1px solid rgba(248, 180, 0, 0.25);
    }

    .role-select {
      background: var(--surface-alt);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 0.3rem 0.6rem;
      font-family: var(--font-mono);
      font-size: 0.8rem;
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .role-select:focus {
      outline: none;
      border-color: var(--accent);
    }

    .locked-cell {
      color: var(--text-muted);
      font-size: 0.78rem;
      font-family: var(--font-mono);
    }

    .form-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      margin-top: 1.25rem;
    }

    .btn-save {
      background: var(--accent);
      color: #fff;
      border: none;
      border-radius: var(--radius);
      padding: 0.5rem 1.25rem;
      font: inherit;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s, transform 0.1s;
    }
    .btn-save:hover { background: #9c3de0; }
    .btn-save:active { transform: scale(0.98); }

    .alert {
      padding: 0.65rem 1rem;
      border-radius: var(--radius);
      font-size: 0.85rem;
      font-family: var(--font-mono);
      margin-bottom: 0.5rem;
    }
    .alert-success {
      background: rgba(52, 211, 153, 0.1);
      border: 1px solid rgba(52, 211, 153, 0.3);
      color: var(--positive);
    }
    .alert-error {
      background: rgba(248, 113, 113, 0.1);
      border: 1px solid rgba(248, 113, 113, 0.3);
      color: var(--negative);
    }
  </style>
</head>
<body>

  <site-header></site-header>

  <main>
    <section class="page-header">
      <hgroup>
        <p class="eyebrow">Admin</p>
        <h1>Manage Users</h1>
      </hgroup>
    </section>

    <?php if ($success_msg): ?>
    <div class="alert alert-success"><?= htmlspecialchars($success_msg) ?></div>
    <?php endif; ?>
    <?php if ($error_msg): ?>
    <div class="alert alert-error"><?= htmlspecialchars($error_msg) ?></div>
    <?php endif; ?>

    <section class="table-section">
      <header class="section-header">
        <h2>All Users</h2>
      </header>

      <form method="post" action="manage-users.php">
        <figure>
          <table class="user-table">
            <caption class="sr-only">User list with roles</caption>
            <thead>
              <tr>
                <th scope="col">Username</th>
                <th scope="col">Current Role</th>
                <th scope="col">Change Role</th>
              </tr>
            </thead>
            <tbody>
              <?php if (empty($groups)): ?>
              <tr>
                <td colspan="3" style="color:var(--text-muted);text-align:center;">
                  No users found in <?= htmlspecialchars($htgroup_file) ?>
                </td>
              </tr>
              <?php else: ?>
              <?php foreach ($groups as $username => $group):
                $is_superadmin = ($group === 'superadmin');
              ?>
              <tr>
                <td><?= htmlspecialchars($username) ?></td>
                <td>
                  <span class="badge badge-<?= htmlspecialchars($group) ?>">
                    <?= htmlspecialchars($group) ?>
                  </span>
                </td>
                <td>
                  <?php if ($is_superadmin): ?>
                    <span class="locked-cell">— locked</span>
                  <?php else: ?>
                    <select name="roles[<?= htmlspecialchars($username) ?>]" class="role-select">
                      <?php foreach ($all_groups as $g):
                        if ($g === 'superadmin') continue;
                      ?>
                      <option value="<?= htmlspecialchars($g) ?>" <?= $group === $g ? 'selected' : '' ?>>
                        <?= htmlspecialchars($g) ?>
                      </option>
                      <?php endforeach; ?>
                    </select>
                  <?php endif; ?>
                </td>
              </tr>
              <?php endforeach; ?>
              <?php endif; ?>
            </tbody>
          </table>
        </figure>

        <div class="form-footer">
          <button type="submit" class="btn-save">Save Changes</button>
        </div>
      </form>

    </section>
  </main>

  <footer role="contentinfo">
    <p>Connected to <abbr title="DigitalOcean Droplet">DO</abbr> / Apache / MySQL; Made with love by Team Ate (and Claude AI)</p>
  </footer>

</body>
</html>