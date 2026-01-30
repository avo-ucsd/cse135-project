// document.addEventListener('DOMContentLoaded', (event) => {
//     const form = document.querySelector('form');

//     form.addEventListener('submit', (e) => {
//         e.preventDefault();

//         // FormData was not used here although it could, but I decided to do it
//         // manually since (1) there are only two inputs of the form I need for the 
//         // body (name and favorite food) and (2) the form isn't that big.
//         const endpoint = form.querySelector('select[id="endpoint"]').value;
//         const method = form.querySelector('select[id="http-method"]').value;
//         const encoding = form.querySelector('select[id="encoding"]').value;
//         const bodyAsObject = {
//             "name": form.querySelector('input[id="name"]').value,
//             "favoriteFood": form.querySelector('input[id="favorite-food"]').value
//         };

//         let body;
//         if (method === 'GET') {
//             body = null;
//         } else if (encoding === 'application/json') {
//             body = JSON.stringify(bodyAsObject);
//         } else {
//             body = new URLSearchParams(bodyAsObject);
//         }

//         fetch(endpoint, {
//             method: method,
//             headers: {
//                 'Content-Type': encoding
//             },
//             body: body
//         })
//         .then(response => response.text())
//         .then(data => {
//             // Display the response somewhere
//             console.log('Response:', data);
//         })
//         .catch(error => {
//             console.error('Error:', error);
//         });

//         console.log(endpoint, method, encoding, body);
//     });
// });

document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('form');

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        // Get form control values
        const endpoint = form.querySelector('select[id="endpoint"]').value;
        const method = form.querySelector('select[id="http-method"]').value;
        const encoding = form.querySelector('select[id="encoding"]').value;
        
        // Build the data object from form inputs
        const bodyAsObject = {
            "name": form.querySelector('input[id="name"]').value,
            "favorite-food": form.querySelector('input[id="favorite-food"]').value
        };

        // Prepare the request based on method and encoding
        let finalEndpoint = endpoint;
        let body = null;
        let headers = {};

        if (method === 'GET') {
            // For GET, append data as query parameters
            const params = new URLSearchParams(bodyAsObject);
            const queryString = params.toString();
            if (queryString) {
                finalEndpoint = `${endpoint}?${queryString}`;
            }
        } else {
            // For POST, PUT, DELETE - set body and headers based on encoding
            if (encoding === 'application/json') {
                body = JSON.stringify(bodyAsObject);
                headers['Content-Type'] = 'application/json';
            } else {
                body = new URLSearchParams(bodyAsObject);
                headers['Content-Type'] = 'application/x-www-form-urlencoded';
            }
        }

        // Make the fetch request
        fetch(finalEndpoint, {
            method: method,
            headers: headers,
            body: body
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.text();
        })
        .then(data => {
            // Display the response
            displayResponse(data);
        })
        .catch(error => {
            console.error('Error:', error);
            displayResponse(`Error: ${error.message}`, true);
        });
    });
});

/**
 * Display the response from the echo endpoint
 * @param {string} data - The response data to display
 * @param {boolean} isError - Whether this is an error message
 */
function displayResponse(data, isError = false) {
    // Check if results div exists, if not create it
    let resultsDiv = document.getElementById('results');
    if (!resultsDiv) {
        resultsDiv = document.createElement('div');
        resultsDiv.id = 'results';
        resultsDiv.style.marginTop = '2rem';
        resultsDiv.style.padding = '1.5rem';
        resultsDiv.style.borderRadius = '8px';
        resultsDiv.style.border = '1px solid #e2e8f0';
        resultsDiv.style.backgroundColor = '#fff';
        
        // Insert after the form section
        const formSection = document.querySelector('section');
        formSection.parentNode.insertBefore(resultsDiv, formSection.nextSibling);
    }

    // Style based on whether it's an error
    if (isError) {
        resultsDiv.style.backgroundColor = '#fee';
        resultsDiv.style.borderColor = '#fcc';
    } else {
        resultsDiv.style.backgroundColor = '#fff';
        resultsDiv.style.borderColor = '#e2e8f0';
    }

    // Add a header
    const header = document.createElement('h3');
    header.textContent = isError ? 'Error' : 'Response from Echo Endpoint';
    header.style.marginTop = '0';
    header.style.color = isError ? '#c00' : '#64748b';

    // Add the response content
    const pre = document.createElement('pre');
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.wordWrap = 'break-word';
    pre.style.fontFamily = 'monospace';
    pre.style.fontSize = '0.9rem';
    pre.style.backgroundColor = '#f8fafc';
    pre.style.padding = '1rem';
    pre.style.borderRadius = '4px';
    pre.style.overflowX = 'auto';
    pre.textContent = data;

    // Clear and update results div
    resultsDiv.innerHTML = '';
    resultsDiv.appendChild(header);
    resultsDiv.appendChild(pre);

    // Scroll to results
    resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}