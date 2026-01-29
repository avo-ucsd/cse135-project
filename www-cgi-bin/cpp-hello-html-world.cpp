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
         << "<title>Hello CGI World! (C++)</title>"
         << "<head>";

    cout << "<body>"
         << "<h1 align=center>Hello HTML World</h1><hr/>"
         << "<p>Hello World! This page was changed by Ashley of Team Ate!</p>"
         << "<figure>"
         <<     "<figcaption><b>My teammates:</b></figcaption>"
         <<     "<blockquote>"
         <<         "\"Why would you willingly want to program in C++?\"" 
         <<     "</blockquote>"
         << "</figure>"
         << "<p>This page was generated with the C++ programming langauge [insert joke about pointers here].</p>";
         
    time_t timestamp;
    time(&timestamp); 
    cout << "<p>This program was generated at: " << ctime(&timestamp) << "</p>";
    
    const char* clientIP = getenv("REMOTE_ADDR");
    if (clientIP != nullptr) {
        cout << "<p>Your current IP address is: " << clientIP << "</p>";
    } else {
        cout << "<p>There was an error with finding your IP address. :(</p>";
    }

    cout << "</body>"
         << "</html>";
}