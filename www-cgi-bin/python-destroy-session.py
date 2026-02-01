#!/usr/bin/env python3

print("Cache-Control: no-cache")
print("Set-Cookie: username=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/")
print("Content-Type: text/html\n")

print("""
<html>
<body>
<h1>Session Destroyed</h1>
<p>Your session data has been cleared.</p>

<p><a href="python-cgi-form.py">Back to Form</a></p>
</body>
</html>
""")
