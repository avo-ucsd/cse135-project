<?php
$failed = isset($_GET['failed']);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login – Reporting</title>
    <style>
        :root {
            --bg: #fdfdfd;
            --text: #333;
            --accent: #883eff;
            --secondary: #64748b;
        }

        *, *::before, *::after {
            box-sizing: border-box;
        }

        body {
            font-family: system-ui, -apple-system, sans-serif;
            line-height: 1.6;
            color: var(--text);
            background-color: var(--bg);
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem 1rem;
            min-height: 100vh;
        }

        header {
            border-bottom: 2px solid #eee;
            padding-bottom: 1rem;
            margin-bottom: 2rem;
        }

        h1 {
            margin: 0;
            color: var(--accent);
        }

        h2 {
            color: var(--secondary);
            border-left: 4px solid var(--accent);
            padding-left: 10px;
            margin-top: 0;
        }

        .login-section {
            background: #f8fafc;
            padding: 1.5rem;
            border-radius: 8px;
            max-width: 400px;
        }

        .form-group {
            margin-bottom: 1rem;
        }

        label {
            display: block;
            font-weight: 600;
            margin-bottom: 0.3rem;
            color: var(--text);
            font-size: 0.95rem;
        }

        input[type="text"],
        input[type="password"] {
            width: 100%;
            padding: 0.55rem 0.75rem;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            font-size: 1rem;
            font-family: inherit;
            color: var(--text);
            background: white;
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
            outline: none;
        }

        input[type="text"]:focus,
        input[type="password"]:focus {
            border-color: var(--accent);
            box-shadow: 0 0 0 3px rgba(136, 62, 255, 0.12);
        }

        button[type="submit"] {
            width: 100%;
            padding: 0.6rem 1rem;
            background: var(--accent);
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 1rem;
            font-family: inherit;
            font-weight: 600;
            cursor: pointer;
            margin-top: 0.5rem;
            transition: background 0.2s ease, transform 0.1s ease;
        }

        button[type="submit"]:hover {
            background: #6e28e0;
        }

        button[type="submit"]:active {
            transform: scale(0.98);
        }

        .error-msg {
            background: #fff0f0;
            border: 1px solid #fca5a5;
            color: #b91c1c;
            border-radius: 6px;
            padding: 0.6rem 0.9rem;
            margin-bottom: 1rem;
            font-size: 0.92rem;
        }

        footer {
            margin-top: 3rem;
            font-size: 0.9rem;
            color: var(--secondary);
            text-align: center;
        }
    </style>
</head>
<body>
    <header>
        <h1>Reporting</h1>
    </header>

    <main>
        <div class="login-section">
            <h2>Sign In</h2>

            <?php if ($failed): ?>
            <div class="error-msg">
                Invalid username or password. Please try again.
            </div>
            <?php endif; ?>

            <form method="POST" action="/j_security_check">
                <div class="form-group">
                    <label for="username">Username</label>
                    <input type="text" id="username" name="httpd_username" autocomplete="username" required>
                </div>
                <div class="form-group">
                    <label for="password">Password</label>
                    <input type="password" id="password" name="httpd_password" autocomplete="current-password" required>
                </div>
                <button type="submit">Log In</button>
            </form>
        </div>
    </main>

    <footer>
        <p>Team Ate Moment</p>
    </footer>
</body>
</html>