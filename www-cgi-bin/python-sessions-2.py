#!/usr/bin/env python3

import os
from http import cookies

print("Cache-Control: no-cache")
print("Content-Type: text/html\n")

cookie = cookies.SimpleCookie(os.environ.get("HTTP_COOKIE"))

username = cookie["username"].value if "username" in cookie else "(null)"

print(f"""
<html>
<body>
<h1>Session Page 2</h1>
<p>Saved Name: {username}</p>

<p><a href="python-session-1.py">Back to Session Page 1</a></p>
<p><a href="python-destroy-session.py">Destroy Session</a></p>
</body>
</html>
""")
