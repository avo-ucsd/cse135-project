#include <ctime>
#include <cstdlib>
#include <iostream>
using namespace std;

int main() {
    cout << "Cache-Control: no-cache\n"
         << "Content-Type: text/html\n\n";

    cout << "<!DOCTYPE html>"
         << "<html>"
         << "<head>"
         << "<title>C++ Sessions (1)</title>"
         << "</head>";

    cout << "<body>"
         << "<h1 align=\"center\">C++ Sessions (Page 1)</h1><hr/>";

    cout << "<section style=\"margin: auto; padding: 1rem; width: 50vw\">"
         <<     "<p>Hello! This is sessions with C++. You are on page 1.</p>"
         <<     "<p>You do <strong>not</strong> have a name yet.</p>"
         <<     "<ul>"
         <<         "<li><a href=\"/cgi-bin/cpp-cgi-form\">C++ CGI Form</a></li>"
         <<         "<li><a href=\"/cgi-bin/cpp-sessions-2\">Session Page 2</a></li>"
         <<         "<li><a href=\"/\">Back to Team Ate home</a></li>"
         <<     "</ul>"
         <<     "<form action=\"/cgi-bin/cpp-destroy-session.cgi\" method=\"get\">"
         <<         "<button type=\"submit\">Destroy Session</button>"
         <<     "</form>"
         << "</section>";
         

    cout << "</body>"
         << "</html>";
}