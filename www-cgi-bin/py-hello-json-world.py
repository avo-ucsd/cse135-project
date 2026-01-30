#py-hello-html-world.py

import datetime
import socket

###### Sending GET Response
# Sending header 
print("Cache-Control: no-cache\n \
       Content-Type: text/html\n\n")

# Get the current date and time
current_datetime = datetime.datetime.now()

def get_local_ip():
    hostname = socket.gethostname()
    ip_address = socket.gethostbyname(hostname)
    return ip_address
client_ip = get_local_ip()

print(f'{{"time":"{current_datetime}","IP":"{client_ip}","message":"This page was generated with Python and made by Vy of Team Ate!","title":"Hello, Python!","heading":"Hello, Python!"}}')
