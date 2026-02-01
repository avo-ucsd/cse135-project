#!/usr/bin/env python3
#py-hello-html-world.py

import datetime
import os

###### Sending GET Response
# Sending header 
print("Cache-Control: no-cache")
print("Content-Type: text/html\n")

# Sending body
print("""<!DOCTYPE html>
<html>
<head>
<title>Hello CGI World! (Python)</title>
<head>
<body>
<h1 align=center>Hello HTML World</h1><hr/>
<p>Hello World! This page was changed by Vy and Ashley of Team Ate!</p>
<figure>
    <figcaption><b>Ashley to Vy:</b></figcaption>
    <blockquote>
        "Brother, I'd be concerned if any CS student doesn't know how to Google how to do "Hello World" for a given language"
    </blockquote>
</figure>
<p>This page was generated with the Python programming language [insert joke about indentation here].</p>""")

# Get the current date and time
current_datetime = datetime.datetime.now()
print(f"<p>This program was generated at: {current_datetime}</p>")

clientIP = os.environ.get("REMOTE_ADDR")
if (clientIP):
    print(f"<p>Your current IP address is: {clientIP}</p>")
else:
    print("<p>There was an error with finding your IP address. :(</p>")

print("""</body>
</html>""")

