#!/usr/bin/env python3

import os
import time
import random
import urllib.parse

SESSION_DIR = "/tmp/python_sessions/"
COOKIE_NAME = "CGISESSID"


# -----------------------------
# Session helpers
# -----------------------------

def get_session_id():
    """
    Parse session ID from HTTP_COOKIE.
    Example: "CGISESSID=abc123; othercookie=value"
    """
    cookies = os.environ.get("HTTP_COOKIE")
    if not cookies:
        return ""

    for part in cookies.split(";"):
        part = part.strip()
        if part.startswith(COOKIE_NAME + "="):
            return part.split("=", 1)[1]

    return ""


def get_username(session_id):
    """
    Read username from session file.
    """
    if not session_id:
        return ""

    try:
        with open(SESSION_DIR + session_id, "r") as f:
            return f.readline().strip()
    except FileNotFoundError:
        return ""


def generate_session_id():
    """
    Generate a simple unique session ID 
    using current time and random number
    """
    random.seed(time.time())
    return f"{int(time.time())}{random.randint(1000, 9999)}"


def get_submitted_username():
    """
    Read username from QUERY_STRING (GET submission).
    QUERY_STRING looks like: "username=John"
    """
    query_string = os.environ.get("QUERY_STRING", "")
    params = urllib.parse.parse_qs(query_string)
    return params.get("username", [""])[0]


def ensure_session_dir():
    """
    Ensure session directory exists.
    """
    os.makedirs(SESSION_DIR, exist_ok=True)


def create_session(session_id, username):
    """
    Write username to session file.
    """
    ensure_session_dir()
    with open(SESSION_DIR + session_id, "w") as f:
        f.write(username)


# -----------------------------
# Main logic
# -----------------------------

session_id = get_session_id()
existing_username = get_username(session_id)
submitted_username = get_submitted_username()

# If a new username is submitted and no existing session, create session
if submitted_username and not existing_username:
    session_id = generate_session_id()
    create_session(session_id, submitted_username)
    existing_username = submitted_username

    # Set cookie header
    print(f"Set-Cookie: {COOKIE_NAME}={session_id}; Path=/")

# Standard CGI headers
print("Cache-Control: no-cache")
print("Content-Type: text/html\n")

# -----------------------------
# HTML output
# -----------------------------

print("""<!DOCTYPE html>
<html>
<head>
    <title>Python CGI Form</title>
</head>
<body>
<h1 align="center">Python CGI Form</h1><hr/>

<section style="margin: auto; padding: 1rem; width: 50vw">
""")

if existing_username:
    print(f"""
    <p>You already have a session with the name:
       <strong>{existing_username}</strong></p>
    <p>Please destroy your current session before creating a new one.</p>

    <form action="/cgi-bin/py-destroy-session.py" method="get">
        <button type="submit">Destroy Session</button>
    </form>
    """)
else:
    print("""
    <form action="/cgi-bin/py-cgi-form.py" method="get">
        <label for="username">Enter your name:</label><br/>
        <input type="text" id="username" name="username" required><br/><br/>
        <button type="submit">Create Session</button>
    </form>
    """)

print("""
<br/>
<ul>
    <li><a href="/cgi-bin/py-sessions-1.py">Session Page 1</a></li>
    <li><a href="/cgi-bin/py-sessions-2.py">Session Page 2</a></li>
    <li><a href="/">Back to Team Ate home</a></li>
</ul>
</section>

</body>
</html>
""")
