#!/usr/bin/env python3
#py-hello-html-world.py

import os
import sys
import datetime

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

# Handle data
body = "(null)"
if (requestMethod):
    if (requestMethod == "GET"):
        body = ""
    else:
        contentLengthStr = os.environ.get("CONTENT_LENGTH")
        if (contentLengthStr) is not None:
            contentLength = int(contentLengthStr)
            if (contentLength > 0):
                body = sys.stdin.read(contentLength)
            else:
                body = ""

# Get the current date and time
current_datetime = datetime.datetime.now()

print(f"""
<table>
  <tbody>
    <tr><td><b>HTTP Protocol:</b></td><td>{protocol or "(null)"}</td></tr>
    <tr><td><b>HTTP Method:</b></td><td>{requestMethod or "(null)"}</td></tr>
    <tr><td><b>Host Name:</b></td><td>{hostName or "(null)"}</td></tr>
    <tr><td><b>Query String:</b></td><td>{queryString or ""}</td></tr>
    <tr><td><b>Message Body:</b></td><td>{body}</td></tr>
    <tr><td><b>Time:</b></td><td>{current_datetime}</td></tr>
    <tr><td><b>User Agent Header:</b></td><td>{userAgent or "(null)"}</td></tr>
    <tr><td><b>IP Address:</b></td><td>{clientIP or "(null)"}</td></tr>
  </tbody>
</table>
""")

print("""</body>
</html>""")
