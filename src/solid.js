import {Quad} from "n3";
import {QueryEngine} from "@comunica/query-sparql";
import {Writer} from "n3";
import fs from "fs";
import fetch from 'node-fetch';
import {WebSocket} from 'ws';

import {buildAuthenticatedFetch, createDpopHeader, generateDpopKeyPair} from "@inrupt/solid-client-authn-core";
import {getWebsocketRequestOptions} from "./util.js";

const solid_auth = {
  auth: false,
  id: undefined,
  secret: undefined,
  host: undefined,
  token: undefined,
  expiration: undefined,
  fetch: fetch
};

/**
 *
 */
export async function setupAuth() {
  try {
    const {host, id, secret} = JSON.parse(fs.readFileSync('solid_credentials.json', 'utf-8'))
    solid_auth.auth = true
    solid_auth.host = host
    solid_auth.id = id
    solid_auth.secret = secret
    await requestAccessToken();
    console.log("Solid auth succeeded")
  } catch (err) {
    if (err.code === "ENOENT") {
      // no file found
      console.log("no file found, skipping auth")
    } else {
      console.error(err);
    }
  }
}

/**
 *
 */
async function requestAccessToken() {
  const dpopKey = await generateDpopKeyPair();

  const data = await (await fetch(solid_auth.host + "/.well-known/openid-configuration".replace("//", "/"))).json()
  const tokenUrl = data.token_endpoint;

  const authString = `${encodeURIComponent(solid_auth.id)}:${encodeURIComponent(solid_auth.secret)}`;
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(authString).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
      dpop: await createDpopHeader(tokenUrl, 'POST', dpopKey),
    },
    body: 'grant_type=client_credentials&scope=webid',
  });

  // access token with expiration in seconds
  const {access_token: accessToken, expires_in: expiration} = await response.json();
  solid_auth.token = accessToken;
  solid_auth.expiration = new Date(Date.now() + (expiration * 1000)).getTime();
  const authFetch = await buildAuthenticatedFetch(fetch, accessToken, {dpopKey: dpopKey});
  solid_auth.fetch = async (url, init) => {
    if (solid_auth.auth && Date.now() >= solid_auth.expiration) {
      console.log("token expired, requesting new token");
      await requestAccessToken();
    }
    return await authFetch(url, init)
  }
}

/**
 *
 * @param url
 * @param resource
 */
export async function getWebsocket(url, resource) {
  const requestOptions = getWebsocketRequestOptions(resource)

  const response = await (await solid_auth.fetch(url, requestOptions)).json()
  const endpoint = response["receiveFrom"];
  return new WebSocket(endpoint);
}

/**
 * Query the data from the Solid pod/resource(s) using the configuration
 * @param {object} config - Configuration object containing the necessary information to query and process the retrieved data.
 * @param {boolean} noCache - clear http cache to get most recent document.
 * @returns {Promise<{array, array}>} Map objects containing the retrieved data
 * and all possible keys representing the properties contained in the maps.
 */
export async function queryResource(config, noCache = false) {
  const myEngine = new QueryEngine();
  if (noCache) {
    await myEngine.invalidateHttpCache();
  }
  const results = [];
  const keys = new Set();
  const query = config.query !== undefined ? config.query : configToSPARQLQuery(config);

  const result = await myEngine.query(query, {
    sources: [config.source],
    fetch: solid_auth.fetch
  });

  const stream = await result.execute();

  stream.on('data', (binding) => {
    const result = new Map();
    binding.entries.forEach((value, key) => {
      keys.add(key)
      result.set(key, value.value);
    });
    results.push(result);
  })

  return new Promise((resolve, reject) => {
    stream.on('end', () => {
      resolve({results, keys});
    });

    stream.on('error', reject);
  });
}

/**
 * Query the available websocket channels that may be listed in a given endpoint
 * @param {string} url - host to query (e.g. http://localhost:3000/.well-known/solid/)
 * @returns {Promise<string[]>} list of available endpoints to request a websocket connection
 */
export async function getNotificationChannelTypes(url) {
  const myEngine = new QueryEngine();
  const result = await (await myEngine.queryBindings(`
        SELECT DISTINCT ?channel WHERE {
            ?s a <http://www.w3.org/ns/pim/space#Storage> .
            ?s <http://www.w3.org/ns/solid/notifications#subscription> ?channel .
            ?channel <http://www.w3.org/ns/solid/notifications#channelType> <http://www.w3.org/ns/solid/notifications#WebSocketChannel2023>
        }`,
  {
    sources: [url],
  }
  )).toArray();
  return result.map(binding => binding.get("channel").value)
}

/**
 * Convert the "fields" configuration data into a SPARQL query
 * @param {object} config - Configuration object containing the necessary information build the SPARQL query (required and optional fields).
 * @returns {string} The constructed SPARQL query.
 */
function configToSPARQLQuery(config) {
  let sparqlQuery = `SELECT DISTINCT * WHERE {\n`;
  for (const key in config.required) {
    sparqlQuery += `    ?s ${config.required[key]} ?${key} .\n`;
  }
  for (const key in config.optional) {
    sparqlQuery += `    OPTIONAL {?s ${config.optional[key]} ?${key}} .\n`;
  }
  sparqlQuery += `}`;

  console.log("Constructed query: ", sparqlQuery);
  return sparqlQuery;
}

/**
 * Add and delete a collection of N-Triples on a Solid resource.
 * @param {[Quad]} deleted - String of N-Triples that should be deleted from the resource.
 * @param {[Quad]} added - String of N-Triples that should be added to the resource.
 * @param {string} url - URL of the resource on which the additions and deletions should be executed.
 */
export async function updateResource(deleted, added, url) {
  if (added.length === 0 && deleted.length === 0) {
    console.log("Synchronization done.");
    return;
  }

  let update = `@prefix solid: <http://www.w3.org/ns/solid/terms#>.
    _:rename a solid:InsertDeletePatch;
    `

  if (deleted.length !== 0) {
    const deletedString = await joinQuads(deleted);
    update += `solid:deletes {
        ${deletedString}
        }`
  }

  if (added.length !== 0) {
    const addedString = await joinQuads(added);
    update += `;
        solid:inserts {
        ${addedString}
        }.
        `
  } else {
    update += '.'
  }

  const response = await solid_auth.fetch(url, {
    method: 'PATCH',
    headers: {'Content-Type': 'text/n3'},
    body: update
  });

  if (response.ok) {
    console.log("Synchronization done.");
  } else if (response.status === 401) {
    console.error(`Synchronization failed. Insufficient write permissions on resource ${url}`);
    console.log(await response.json())
  } else {
    console.error("Synchronization failed.");
  }
}

/**
 * Convert an array of quads into a string of N-triples.
 * @param {[Quad]} quads - Array of quads that should be converted.
 * @returns {Promise<string>} String of N-triples.
 */
async function joinQuads(quads) {
  const writer = new Writer({format: 'N-Triples'});
  writer.addQuads(quads);

  return new Promise(resolve => {
    writer.end((error, result) => {
      resolve(result);
    })
  })
}
setupAuth().then(() => {
  solid_auth.fetch("http://localhost:3000/example/software", {
    method: "PATCH",
    headers: {"Content-Type": "text/n3"},
    body: `@prefix solid: <http://www.w3.org/ns/solid/terms#>.
@prefix software: <https://data.knows.idlab.ugent.be/person/office/software#>.
@prefix schema: <http://schema.org/>.
_:rename a solid:InsertDeletePatch; 
solid:deletes { software:fdsq schema:description "testtest2". };
solid:inserts { software:fdsq schema:description "testtest". }.`
  })
}
)
