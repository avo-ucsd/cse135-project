#include <cstdlib>
#include <iostream>
using namespace std;

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

     char** env = environ;
     while (*env) {
          cout << *env << "\n";
          *env++;
     }

    cout << "</body>"
         << "</html>";
}