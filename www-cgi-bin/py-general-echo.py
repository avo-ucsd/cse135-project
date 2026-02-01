#!/usr/bin/env python3
#py-hello-html-world.py

import os

###### Sending GET Response
# Sending header 
print("Cache-Control: no-cache")
print("Content-Type: text/html\n")

# Sending body
print("""<!DOCTYPE html>
<html>
<head>
<title>General Echo (Python)</title>
<head>
<body>
<h1 align=\"center\">General Request Echo (Python Edition)</h1><hr>""")

hostName       = os.environ.get("HTTP_HOST")
userAgent      = os.environ.get("HTTP_USER_AGENT")
clientIP       = os.environ.get("REMOTE_ADDR")
requestMethod  = os.environ.get("REQUEST_METHOD")
queryString    = os.environ.get("QUERY_STRING")
protocol       = os.environ.get("SERVER_PROTOCOL")

print("""</body>
</html>""")
