#include <ctime>
#include <cstdlib>
#include <iostream>
#include <fstream>
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

/**
 * Read the username from the session file in /tmp/cpp_sessions/
 * Returns empty string if no session file exists.
 */
string getUsername(const string& sessionId) {
    if (sessionId.empty()) return "";

    ifstream sessionFile(SESSION_DIR + sessionId);
    if (!sessionFile.is_open()) return "";

    string username;
    getline(sessionFile, username);
    sessionFile.close();

    return username;
}

int main() {
    string sessionId = getSessionId();
    string username = getUsername(sessionId);

    cout << "Cache-Control: no-cache\n"
         << "Content-Type: text/html\n\n";

    cout << "<!DOCTYPE html>"
         << "<html>"
         << "<head>"
         << "<title>C++ Sessions (1)</title>"
         << "</head>";

    cout << "<body>"
         << "<h1 align=\"center\">C++ Sessions (Page 2)</h1><hr/>";

    cout << "<section style=\"margin: auto; padding: 1rem; width: 50vw\">"
         <<     "<p>Hello! This is sessions with C++. You are on <strong>page 2</strong>.</p>";

    if (username.empty()) {
        cout << "<p>You do <strong>not</strong> have a name yet.</p>";
    } else {
        cout << "<p>Hello, <strong>" << username << "</strong>!</p>";
    }

    cout <<     "<ul>"
         <<         "<li><a href=\"/cgi-bin/cpp-cgi-form.cgi\">C++ CGI Form</a></li>"
         <<         "<li><a href=\"/cgi-bin/cpp-sessions-1.cgi\">Session Page 1</a></li>"
         <<         "<li><a href=\"/\">Back to Team Ate home</a></li>"
         <<     "</ul>"
         <<     "<form action=\"/cgi-bin/cpp-destroy-session.cgi\" method=\"get\">"
         <<         "<button type=\"submit\">Destroy Session</button>"
         <<     "</form>"
         << "</section>";

    cout << "</body>"
         << "</html>";
}