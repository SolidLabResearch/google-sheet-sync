import {createServer} from 'http';
import {parse} from 'url';
import {config} from 'dotenv';
import {google} from 'googleapis';
import fs from 'fs';

const port = 8081;

let client;

const server = createServer(async (request, response) => {
  const {query} = parse(request.url, true);
  const code = query.code;
  const id = query.id;
  const secret = query.secret;
  const host = query.host;
  const solidLogout = query.solid_logout;
  let status = '';
  if (code) {
    // capture google code
    client.getToken(code, (error, token) => {
      if (error) {
        console.error('Error retrieving access token:', error);
        response.writeHead(400, {'Content-Type': 'text/plain'});
        response.end('Error: Code missing or incorrect');
      }

      const jsonString = JSON.stringify(token, null, 2);
      fs.writeFileSync('credentials.json', jsonString, 'utf-8');
    });
  }
  if (id && secret && host) {
    console.log('received solid id and secret');
    fs.writeFileSync('solid-credentials.json', JSON.stringify({id, secret, host}), 'utf-8');
    status = '[DONE]\tlogin';
  }
  if (solidLogout) {
    fs.writeFileSync('solid-credentials.json', '');
    status = '[DONE]\tlogout';
  }
  const authUrl = client.generateAuthUrl({
    /*eslint-disable camelcase*/
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/spreadsheets'],
    /*eslint-disable camelcase*/
    redirect_uri: 'http://localhost:' + port
  });

  fs.readFile('src/auth-server/index.html', 'utf8', (error, data) => {
    if (error) {
      response.writeHead(500, {'Content-Type': 'text/plain'});
      response.end('Internal Server Error');
      return;
    }

    const html = data.replace('DYNAMIC_AUTH_URL', authUrl).replace('STATUS_TEXT', status);

    response.writeHead(200, {'Content-Type': 'text/html'});
    response.end(html);
  });

});

/**
 *
 */
function main() {
  config();
  const {GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET} = process.env;
  client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, 'http://localhost:' + port);

  server.listen(port, () => {
    console.log('Authentication server running on port', port);
  });
}

main();
