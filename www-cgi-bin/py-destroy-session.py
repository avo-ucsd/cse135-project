#!/usr/bin/env python3

import os

SESSION_DIR = "/tmp/python_sessions/"
COOKIE_NAME = "CGISESSID"


def getSessionId():
    """
    Parse the session ID from the HTTP_COOKIE environment variable.
    HTTP_COOKIE looks like: "CGISESSID=abc123; othercookie=value"
    """
    cookies = os.environ.get("HTTP_COOKIE")
    if not cookies:
        return ""

    for part in cookies.split(";"):
        part = part.strip()
        if part.startswith(COOKIE_NAME + "="):
            return part.split("=", 1)[1]

    return ""


sessionId = getSessionId()

# Delete session file if it exists
if sessionId:
    try:
        os.remove(SESSION_DIR + sessionId)
    except FileNotFoundError:
        pass



#Expire the cookie by setting a date in the past
print("Set-Cookie: CGISESSID=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT")
print("Cache-Control: no-cache")
print("Content-Type: text/html\n")

print("""
<!DOCTYPE html>
<html>
<head>
<title>Session Destroyed</title> 
</head>

<body>
<h1 align=\"center\">Session Destroyed</h1><hr/>
<section style=\"margin: auto; padding: 1rem; width: 50vw\">    
    <p>Your session has been successfully destroyed.</p>
    <ul>
        <li><a href=\"/cgi-bin/py-cgi-form.py\">C++ CGI Form</a></li>
        <li><a href=\"/cgi-bin/py-sessions-1.py\">Session Page 1</a></li>
        <li><a href=\"/cgi-bin/py-sessions-2.py\">Session Page 2</a></li>
        <li><a href=\"/\">Back to Team Ate home</a></li>
    </ul>
</section>

<p><a href="py-cgi-form.py">Back to Form</a></p>
</body>
</html>
""")
