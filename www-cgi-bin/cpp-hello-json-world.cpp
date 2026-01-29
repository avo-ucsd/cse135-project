#include <ctime>
#include <cstdlib>
#include <iostream>
using namespace std;

int main() {
    cout << "Cache-Control: no-cache\n"
         << "Content-Type: application/json\n\n";

    time_t timestamp;
    time(&timestamp); 
    
    const char* clientIP = getenv("REMOTE_ADDR");
    
    cout << "{"
         <<     "\"title\":\"Hello, C++!\","
         <<     "\"heading\":\"Hello, C++!\","
         <<     "\"message\":\"This page was generated with C++ and made by Ashley of Team Ate!\","
         <<     "\"time\":\"" << ctime(&timestamp) << "\","
         <<     "\"IP\":\"" << clientIP << "\""
         << "}";
}