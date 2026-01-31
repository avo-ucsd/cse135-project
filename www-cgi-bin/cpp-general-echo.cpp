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

    // Handle data
    string body = "(null)";
    if (requestMethod != nullptr) {
        if (strcmp(requestMethod, "GET") == 0) {
            const char* queryString = getenv("QUERY_STRING");
            if (queryString != nullptr) {
                body = queryString;
            }
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
         <<             "<td>Host Name:</td>"
         <<             "<td>" << (hostName ? hostName : "(null)") << "</td>"
         <<         "</tr>" 
         <<         "<tr>" 
         <<             "<td>Message Body (data):</td>"
         <<             "<td>" << body << "</td>"
         <<         "</tr>" 
         <<         "<tr>" 
         <<             "<td>Time:</td>"
         <<             "<td>" << ctime(&timestamp) << "</td>"
         <<         "</tr>" 
         <<         "<tr>" 
         <<             "<td>User Agent Header:</td>"
         <<             "<td>" << (userAgent ? userAgent : "(null)") << "</td>"
         <<         "</tr>" 
         <<         "<tr>" 
         <<             "<td>IP Address:</td>"
         <<             "<td>" << (clientIP ? clientIP : "(null)") << "</td>"
         <<         "</tr>" 
         <<     "</tbody>" 
         << "</table>";

    cout << "</body>"
         << "</html>";
}