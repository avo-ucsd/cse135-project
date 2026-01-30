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
        const method = form.querySelector('select[id="http-method"]').value;
        const endpoint = form.querySelector('select[id="endpoint"]').value;
        const encoding = form.querySelector('select[id="encoding"]').value;

        // For GET and POST, let the native form submission handle it
        if (method === 'GET' || method === 'POST') {
            // Set the form action and method
            form.setAttribute('action', endpoint);
            form.setAttribute('method', method);
            
            // Set encoding based on selection
            if (encoding === 'application/json') {
                // JSON encoding for forms isn't natively supported, 
                // so we need to use fetch even for POST
                e.preventDefault();
                submitWithFetch(endpoint, method, encoding);
            } else {
                // Let native form submission happen for x-www-form-urlencoded
                form.setAttribute('enctype', 'application/x-www-form-urlencoded');
                // Don't prevent default - let it navigate
            }
        } else {
            // For PUT and DELETE, we must use fetch
            e.preventDefault();
            submitWithFetch(endpoint, method, encoding);
        }
    });
});

/**
 * Submit form data using fetch API (for PUT, DELETE, or JSON encoding)
 */
function submitWithFetch(endpoint, method, encoding) {
    const form = document.querySelector('form');
    
    // Build the data object from form inputs (excluding control fields)
    const bodyAsObject = {
        "name": form.querySelector('input[id="name"]').value,
        "favorite-food": form.querySelector('input[id="favorite-food"]').value
    };

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
        // Open the response in a new window/tab to mimic HTTPBin behavior
        const newWindow = window.open('', '_blank');
        if (newWindow) {
            newWindow.document.write('<pre>' + escapeHtml(data) + '</pre>');
            newWindow.document.close();
        } else {
            // If popup blocked, display inline
            displayInline(data);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert(`Error: ${error.message}`);
    });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Display response inline if popup is blocked
 */
function displayInline(data) {
    // Create or get results div
    let resultsDiv = document.getElementById('results');
    if (!resultsDiv) {
        resultsDiv = document.createElement('div');
        resultsDiv.id = 'results';
        resultsDiv.style.marginTop = '2rem';
        resultsDiv.style.padding = '1.5rem';
        resultsDiv.style.borderRadius = '8px';
        resultsDiv.style.border = '1px solid #e2e8f0';
        resultsDiv.style.backgroundColor = '#fff';
        
        const main = document.querySelector('main');
        main.appendChild(resultsDiv);
    }

    const header = document.createElement('h3');
    header.textContent = 'Response (popup was blocked)';
    header.style.marginTop = '0';
    header.style.color = '#64748b';

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

    resultsDiv.innerHTML = '';
    resultsDiv.appendChild(header);
    resultsDiv.appendChild(pre);
    resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}