#!/usr/bin/env python3

import os
from http import cookies

print("Cache-Control: no-cache")
print("Content-Type: text/html\n")

cookie = cookies.SimpleCookie(os.environ.get("HTTP_COOKIE"))

username = cookie["username"].value if "username" in cookie else "(null)"

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

if (username):
    print(f"<p>Wake up {username}, we got a city to burn. [insert 2077 BGM]</p>")
else:
    print("""
        <p>Welcome tarnished, come to the Land Between for the Elden Ring hmm?
        Unfortunately for you, however, you are <strong>MAIDENLESS</strong>. <br>
        Create a CGI Form, link down below, to proceed your journey.</p>
        <img src="https://media1.tenor.com/m/3bQqZHTOsgcAAAAd/no-maidens-elden-ring.gif" width="10vw" alt="You got 0 maidens my dude">
        """)
    
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
