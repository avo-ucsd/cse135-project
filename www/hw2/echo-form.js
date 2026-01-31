document.addEventListener('DOMContentLoaded', (event) => {
    const form = document.querySelector('form');

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        // FormData was not used here although it could, but I decided to do it
        // manually since (1) there are only two inputs of the form I need for the 
        // body (name and favorite food) and (2) the form isn't that big.
        const endpoint = form.querySelector('select[id="endpoint"]').value;
        const method = form.querySelector('select[id="http-method"]').value;
        const encoding = form.querySelector('select[id="encoding"]').value;
        const bodyAsObject = {
            "name": form.querySelector('input[id="name"]').value,
            "favoriteFood": form.querySelector('input[id="favorite-food"]').value
        };

        let body;
        let modifiedEndpoint = endpoint;
        if (method === 'GET') {
            // GET does not have a body. It goes in the query string, so update
            // the endpoint to include it.
            const parameters = new URLSearchParams(bodyAsObject);
            const queryString = parameters.toString();
            modifiedEndpoint = `${endpoint}?${queryString}`;
            body = null;
        } else {
            if (encoding === 'application/json') {
                body = JSON.stringify(bodyAsObject);
            } else {
                body = new URLSearchParams(bodyAsObject);
            }
        }

        console.log("=============== ENDPOINT ===============\n", endpoint);
        console.log("=============== METHOD ===============\n", method);
        console.log("=============== ENCODING ===============\n", encoding);
        console.log("=============== BODY ===============\n", body);

        fetch(modifiedEndpoint, {
              method: method,
              headers: {
                'Content-Type': encoding
              },
              body: body
        })
        .then(response => response.text())
        .then(data => {
            // Display the response somewhere
            console.log('Response:', data);
            const output = document.querySelector('#echo-output');
            output.innerHTML = data;
        })
        .catch(error => {
            console.error('Error:', error);
        });
    });
});

// document.addEventListener('DOMContentLoaded', () => {
//     const form = document.querySelector('form');

//     form.addEventListener('submit', (e) => {
//         const method = form.querySelector('select[id="http-method"]').value;
//         const endpoint = form.querySelector('select[id="endpoint"]').value;
//         const encoding = form.querySelector('select[id="encoding"]').value;

//         // For GET and POST, let the native form submission handle it
//         if (method === 'GET' || method === 'POST') {
//             // Set the form action and method
//             form.setAttribute('action', endpoint);
//             form.setAttribute('method', method);
            
//             // Set encoding based on selection
//             if (encoding === 'application/json') {
//                 // JSON encoding for forms isn't natively supported, 
//                 // so we need to use fetch even for POST
//                 e.preventDefault();
//                 submitWithFetch(endpoint, method, encoding);
//             } else {
//                 // Let native form submission happen for x-www-form-urlencoded
//                 form.setAttribute('enctype', 'application/x-www-form-urlencoded');
//                 // Don't prevent default - let it navigate
//             }
//         } else {
//             // For PUT and DELETE, we must use fetch
//             e.preventDefault();
//             submitWithFetch(endpoint, method, encoding);
//         }
//     });
// });

// /**
//  * Submit form data using fetch API (for PUT, DELETE, or JSON encoding)
//  */
// function submitWithFetch(endpoint, method, encoding) {
//     const form = document.querySelector('form');
    
//     // Build the data object from form inputs (excluding control fields)
//     const bodyAsObject = {
//         "name": form.querySelector('input[id="name"]').value,
//         "favorite-food": form.querySelector('input[id="favorite-food"]').value
//     };

//     let finalEndpoint = endpoint;
//     let body = null;
//     let headers = {};

//     if (method === 'GET') {
//         // For GET, append data as query parameters
//         const params = new URLSearchParams(bodyAsObject);
//         const queryString = params.toString();
//         if (queryString) {
//             finalEndpoint = `${endpoint}?${queryString}`;
//         }
//     } else {
//         // For POST, PUT, DELETE - set body and headers based on encoding
//         if (encoding === 'application/json') {
//             body = JSON.stringify(bodyAsObject);
//             headers['Content-Type'] = 'application/json';
//         } else {
//             body = new URLSearchParams(bodyAsObject);
//             headers['Content-Type'] = 'application/x-www-form-urlencoded';
//         }
//     }

//     // Make the fetch request
//     fetch(finalEndpoint, {
//         method: method,
//         headers: headers,
//         body: body
//     })
//     .then(response => {
//         if (!response.ok) {
//             throw new Error(`HTTP error! status: ${response.status}`);
//         }
//         return response.text();
//     })
//     .then(data => {
//         // Open the response in a new window/tab to mimic HTTPBin behavior
//         const newWindow = window.open('', '_blank');
//         if (newWindow) {
//             newWindow.document.write('<pre>' + escapeHtml(data) + '</pre>');
//             newWindow.document.close();
//         } else {
//             // If popup blocked, display inline
//             displayInline(data);
//         }
//     })
//     .catch(error => {
//         console.error('Error:', error);
//         alert(`Error: ${error.message}`);
//     });
// }