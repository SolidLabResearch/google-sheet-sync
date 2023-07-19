import {createServer} from 'http';
import {parse} from 'url';
import {config} from "dotenv";
import {google} from "googleapis";
import fs from 'fs';

const port = 80;

let client;

const server = createServer((request, response) => {
    const {query} = parse(request.url, true);
    const code = query.code;

    if (code) {
        client.getToken(code, (err, token) => {
            if (err) {
                console.error('Error retrieving access token:', err);
                response.writeHead(400, {'Content-Type': 'text/plain'});
                response.end("Error: Code missing or incorrect");
            }

            const jsonString = JSON.stringify(token, null, 2);
            fs.writeFileSync('credentials.json', jsonString, 'utf-8');

            response.writeHead(200, {'Content-Type': 'text/plain'});
            response.end('Authentication succeeded. Credentials written to "credentials.json"');
        });
    } else {
        const authUrl = client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/spreadsheets'],
            redirect_uri: "http://localhost:" + port
        });

        response.writeHead(302, {'Location': authUrl});
        response.end();
    }
})

function main() {
    config();
    const {GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET} = process.env;
    client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, 'http://localhost:' + port);

    server.listen(port, () => {
        console.log("Authentication server running on port", port);
    })
}

main();