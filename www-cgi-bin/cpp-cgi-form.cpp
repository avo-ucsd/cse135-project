#include <cstdlib>
#include <cstring>
#include <iostream>
#include <fstream>
#include <string>
#include <ctime>
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

/**
 * Generate a simple unique session ID using current time and random number.
 */
string generateSessionId() {
    srand(time(nullptr));
    string id = to_string(time(nullptr)) + to_string(rand());
    return id;
}

/**
 * Read the submitted username from QUERY_STRING (GET form submission).
 * QUERY_STRING looks like: "username=John"
 */
string getSubmittedUsername() {
    const char* queryString = getenv("QUERY_STRING");
    if (queryString == nullptr) return "";

    string qs(queryString);
    string target = "username=";
    size_t pos = qs.find(target);

    if (pos == string::npos) return "";

    pos += target.length();
    size_t end = qs.find("&", pos);
    if (end == string::npos) end = qs.length();

    return qs.substr(pos, end - pos);
}

int main() {
    string sessionId = getSessionId();
    string existingUsername = getUsername(sessionId);
    string submittedUsername = getSubmittedUsername();

    // If a new username was submitted and no existing session, create one
    if (!submittedUsername.empty() && existingUsername.empty()) {
        sessionId = generateSessionId();

        // Ensure session directory exists
        system("mkdir -p /tmp/cpp_sessions");

        // Write username to session file
        ofstream sessionFile(SESSION_DIR + sessionId);
        sessionFile << submittedUsername;
        sessionFile.close();

        existingUsername = submittedUsername;

        // Set the session cookie in the header
        cout << "Set-Cookie: CGISESSID=" << sessionId << "; Path=/\n";
    }

    cout << "Cache-Control: no-cache\n"
         << "Content-Type: text/html\n\n";

    cout << "<!DOCTYPE html>"
         << "<html>"
         << "<head>"
         << "<title>C++ CGI Form</title>"
         << "</head>";

    cout << "<body>"
         << "<h1 align=\"center\">C++ CGI Form</h1><hr/>";

    cout << "<section style=\"margin: auto; padding: 1rem; width: 50vw\">";

    if (!existingUsername.empty()) {
        // User already has a session - prompt them to destroy it first
        cout << "<p>You already have a session with the name: <strong>" << existingUsername << "</strong></p>"
             << "<p>Please destroy your current session before creating a new one.</p>"
             << "<form action=\"/cgi-bin/cpp-destroy-session.cgi\" method=\"get\">"
             <<     "<button type=\"submit\">Destroy Session</button>"
             << "</form>";
    } else {
        // No session - show the form
        cout << "<form action=\"/cgi-bin/cpp-cgi-form.cgi\" method=\"get\">"
             <<     "<label for=\"username\">Enter your name:</label><br/>"
             <<     "<input type=\"text\" id=\"username\" name=\"username\" required><br/><br/>"
             <<     "<button type=\"submit\">Create Session</button>"
             << "</form>";
    }

    cout << "<br/>"
         << "<ul>"
         <<     "<li><a href=\"/cgi-bin/cpp-sessions-1.cgi\">Session Page 1</a></li>"
         <<     "<li><a href=\"/cgi-bin/cpp-sessions-2.cgi\">Session Page 2</a></li>"
         <<     "<li><a href=\"/\">Back to Team Ate home</a></li>"
         << "</ul>"
         << "</section>";

    cout << "</body>"
         << "</html>";
}