#include <ctime>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <string>
using namespace std;

int main() {
    cout << "Cache-Control: no-cache\n"
         << "Content-Type: text/html\n\n";

    cout << "<!DOCTYPE html>"
         << "<html>"
         << "<head>"
         << "<title>General Echo (C++)</title>"
         << "</head>"
         << "<body>";

    cout << "<h1 align=\"center\">General Request Echo (C++)</h1>";

    const char* hostName = getenv("HTTP_HOST");
    const char* userAgent = getenv("HTTP_USER_AGENT");
    const char* clientIP = getenv("REMOTE_ADDR");
    const char* requestMethod = getenv("REQUEST_METHOD");
    const char* queryString = getenv("QUERY_STRING");
    const char* protocol = getenv("SERVER_PROTOCOL");

    // Handle data
    string body = "(null)";
    if (requestMethod != nullptr) {
        if (strcmp(requestMethod, "GET") == 0) {
            body = "";
        } else {
            char* contentLengthStr = getenv("CONTENT_LENGTH");
            if (contentLengthStr != nullptr) {
                int contentLength = atoi(contentLengthStr);

                if (contentLength > 0) { 
                    body.resize(contentLength);
                    cin.read(&body[0], contentLength);
                } else {
                    body = "";
                }
            }
        }
    }

    time_t timestamp;
    time(&timestamp); 
    cout << "<table>"
         <<     "<tbody>" 
         <<         "<tr>" 
         <<             "<td><b>HTTP Protocol:</b></td>"
         <<             "<td>" << (protocol ? protocol : "(null)") << "</td>"
         <<         "</tr>" 
         <<         "<tr>" 
         <<             "<td><b>HTTP Method:</b></td>"
         <<             "<td>" << (requestMethod ? requestMethod : "(null)") << "</td>"
         <<         "</tr>" 
         <<         "<tr>" 
         <<             "<td><b>Host Name:</b></td>"
         <<             "<td>" << (hostName ? hostName : "(null)") << "</td>"
         <<         "</tr>" 
         <<         "<tr>" 
         <<             "<td><b>Query String:</b></td>"
         <<             "<td>" << (queryString ? queryString : "") << "</td>"
         <<         "</tr>" 
         <<         "<tr>" 
         <<             "<td><b>Message Body:</b></td>"
         <<             "<td>" << body << "</td>"
         <<         "</tr>" 
         <<         "<tr>" 
         <<             "<td><b>Time:</b></td>"
         <<             "<td>" << ctime(&timestamp) << "</td>"
         <<         "</tr>" 
         <<         "<tr>" 
         <<             "<td><b>User Agent Header:</b></td>"
         <<             "<td>" << (userAgent ? userAgent : "(null)") << "</td>"
         <<         "</tr>" 
         <<         "<tr>" 
         <<             "<td><b>IP Address:</b></td>"
         <<             "<td>" << (clientIP ? clientIP : "(null)") << "</td>"
         <<         "</tr>" 
         <<     "</tbody>" 
         << "</table>";

    cout << "</body>"
         << "</html>";
}