#include <cstdlib>
#include <iostream>
using namespace std;

extern char** environ;

int main() {
    cout << "Cache-Control: no-cache\n"
         << "Content-Type: text/html\n\n";

    cout << "<!DOCTYPE html>"
         << "<html>"
         << "<head>"
         << "<title>Hello CGI World! (C++)</title>"
         << "</head>"
         << "<body>"
         << "<h1 align=\"center\">Environment Variables</h1>"
         << "<hr>";
     
     for (char** env = environ; *env != nullptr; ++env) {
          cout << "<p>" << *env << "</p>\n";
     }

    cout << "</body>"
         << "</html>";
}