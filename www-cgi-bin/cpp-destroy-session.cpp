#include <cstdlib>
#include <iostream>
#include <string>
using namespace std;

const string SESSION_DIR = "/tmp/cpp_sessions/";

/**
 * Parse the session ID from the HTTP_COOKIE environment variable.
 * HTTP_COOKIE looks like: "CGISESSID=abc123; othercookie=value"
 */
string getSessionId() {
    const char* cookies = getenv("HTTP_COOKIE");
    if (cookies == nullptr) return "";

    string cookieStr(cookies);
    string target = "CGISESSID=";
    size_t pos = cookieStr.find(target);

    if (pos == string::npos) return "";

    pos += target.length();
    size_t end = cookieStr.find(";", pos);
    if (end == string::npos) end = cookieStr.length();

    return cookieStr.substr(pos, end - pos);
}

int main() {
    string sessionId = getSessionId();

    // Delete the session file if it exists
    if (!sessionId.empty()) {
        string filePath = SESSION_DIR + sessionId;
        remove(filePath.c_str());
    }

    // Expire the cookie by setting a date in the past
    cout << "Set-Cookie: CGISESSID=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT\n";
    cout << "Cache-Control: no-cache\n"
         << "Content-Type: text/html\n\n";

    cout << "<!DOCTYPE html>"
         << "<html>"
         << "<head>"
         << "<title>Session Destroyed</title>"
         << "</head>";

    cout << "<body>"
         << "<h1 align=\"center\">Session Destroyed</h1><hr/>";

    cout << "<section style=\"margin: auto; padding: 1rem; width: 50vw\">"
         <<     "<p>Your session has been successfully destroyed.</p>"
         <<     "<ul>"
         <<         "<li><a href=\"/cgi-bin/cpp-cgi-form.cgi\">C++ CGI Form</a></li>"
         <<         "<li><a href=\"/cgi-bin/cpp-sessions-1.cgi\">Session Page 1</a></li>"
         <<         "<li><a href=\"/cgi-bin/cpp-sessions-2.cgi\">Session Page 2</a></li>"
         <<         "<li><a href=\"/\">Back to Team Ate home</a></li>"
         <<     "</ul>"
         << "</section>";

    cout << "</body>"
         << "</html>";
}