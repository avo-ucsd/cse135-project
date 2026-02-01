#!/usr/bin/env python3

import os
from http import cookies

SESSION_DIR = "/tmp/python_sessions/"
COOKIE_NAME = "CGISESSID"

def getSessionId():
    cookies = os.environ.get("HTTP_COOKIE")
    if not cookies:
        return ""

    for part in cookies.split(";"):
        part = part.strip()
        if part.startswith(COOKIE_NAME + "="):
            return part.split("=", 1)[1]

    return ""

def getUsername(sessionId):
    if not sessionId:
        return ""

    try:
        with open(SESSION_DIR + sessionId, "r") as f:
            return f.readline().strip()
    except FileNotFoundError:
        return ""

# -----------------------------
# Main logic
# -----------------------------
sessionId = getSessionId()
username = getUsername(sessionId)

print("Cache-Control: no-cache")
print("Content-Type: text/html\n")

print(f"""
<!DOCTYPE html>
<html>
<head>
<title>Python C++ Sessions</title>
</head>
    
<body>
<h1 align=\"center\">C++ Sessions (Page 1)</h1><hr/>
<section style=\"margin: auto; padding: 1rem; width: 50vw\">
    <p>Hello! This is sessions with C++. You are on <strong>page 1</strong>.</p>
""")

if not username:
    print("<p>You do <strong>not</strong> have a name yet. Womp Womp.</p>")
else:
    print(f"<p>Hello {username}, looking S3XY today.</p>")


print(f"""
    <ul>
        <li><a href=\"/cgi-bin/py-cgi-form.py\">C++ CGI Form</a></li>
        <li><a href=\"/cgi-bin/py-sessions-2.py\">Session Page 2</a></li>
        <li><a href=\"/\">Back to Team Ate home</a></li>
    </ul>
    <form action=\"/cgi-bin/cpp-destroy-session.cgi\" method=\"get\">
        <button type=\"submit\">Destroy Session</button>
    </form>
</section>

</body>
</html>
""")
