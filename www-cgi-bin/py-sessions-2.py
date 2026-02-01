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
    print("""
    <p>Welcome tarnished, come to the Land Between for the Elden Ring hmm?
    Unfortunately for you, however, you are <strong>MAIDENLESS</strong>. <br>
    You are currently do <strong>NOT</strong> a name yet. Create a CGI Form, link down below, to proceed your journey.</p>
    <img src="https://media1.tenor.com/m/3bQqZHTOsgcAAAAd/no-maidens-elden-ring.gif" width="150vw" alt="You got 0 maidens my dude">
    """)
else:
    print(f"<p>Wake up {username}, we got a city to burn. [insert 2077 BGM]</p>")

    
print(f"""
    <ul>
        <li><a href=\"/cgi-bin/py-cgi-form.py\">C++ CGI Form</a></li>
        <li><a href=\"/cgi-bin/py-sessions-1.py\">Session Page 1</a></li>
        <li><a href=\"/\">Back to Team Ate home</a></li>
    </ul>
    <form action=\"/cgi-bin/py-destroy-session.py\" method=\"get\">
        <button type=\"submit\">Destroy Session</button>
    </form>
</section>

</body>
</html>
""")
