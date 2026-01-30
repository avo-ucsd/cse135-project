#!/usr/bin/env python3
#py-hello-html-world.py

import datetime
import socket

###### Sending GET Response
# Sending header 
print("Cache-Control: no-cache\n \
       Content-Type: text/html\n\n")

# Sending body
print("""<!DOCTYPE html>
<html>
<head>
<title>Hello CGI World! (Python)</title>
<head>
<body>
<h1 align=center>Hello HTML World</h1><hr/>
<p>Hello World! This page was changed by Ashley of Team Ate!</p>
<figure>
    <figcaption><b>My teammates:</b></figcaption>
    <blockquote>
        "Why would you willingly want to program in C++?" 
    </blockquote>
</figure>
<p>This page was generated with the Python programming language [insert joke about indentation here].</p>""")

# Get the current date and time
current_datetime = datetime.datetime.now()
print("""<p>This program was generated at: %f </p>""" % (current_datetime))

def get_local_ip():
    hostname = socket.gethostname()
    ip_address = socket.gethostbyname(hostname)
    return ip_address
client_ip = get_local_ip()
if (client_ip):
    print(f"<p>Your current IP address is: {client_ip}</p>%")
else:
    print("<p>There was an error with finding your IP address. :(</p>")

print("""</body>
</html>""")

