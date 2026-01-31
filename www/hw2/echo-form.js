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

        fetch(modifiedEndpoint, {
              method: method,
              headers: {
                'Content-Type': encoding
              },
              body: body
        })
        .then(response => response.text())
        .then(data => {
            const output = document.querySelector('#echo-output');
            output.innerHTML = data;
        })
        .catch(error => {
            console.error('Error:', error);
        });
    });
});