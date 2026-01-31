#!/usr/bin/env python3
#py-env.py

import datetime
import socket
import os

###### Sending GET Response
# Sending header 
print("Cache-Control: no-cache")
print("Content-Type: text/html\n")

# Sending body
print("""<!DOCTYPE html>
<html>
<head>
<title>Environment Variable (Python)</title>
<head>
<body>
<h1 align=\"center\">Environment Variables (Python Edition)</h1><hr>""")

for header, header_value in os.environ.items():
    print(f"<p>{header} = {header_value}</p>")

print("""</body>
</html>""")
