#include <cstring>
#include <ctime>
#include <cstdlib>
#include <iostream>
using namespace std;

int main() {
    cout << "Cache-Control: no-cache\n"
         << "Content-Type: application/json\n\n";

    time_t timestamp;
    time(&timestamp); 
    // ctime adds a newline when converted to a string. Strip it.
    char* t = ctime(&timestamp);
    if (t[strlen(t)-1] == '\n') {
        t[strlen(t)-1] = '\0';
    }
    
    const char* clientIP = getenv("REMOTE_ADDR");
    
    cout << "{"
         <<     "\"time\":\"" << t << "\","
         <<     "\"IP\":\"" << clientIP << "\","
         <<     "\"message\":\"This page was generated with C++ and made by Ashley of Team Ate!\","
         <<     "\"title\":\"Hello, C++!\","
         <<     "\"heading\":\"Hello, C++!\""
         << "}";
}