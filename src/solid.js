import {QueryEngine} from "@comunica/query-sparql";
import {Writer} from "n3";

/**
 * Query the data from the Solid pod/resource(s) using the configuration
 * @param {Object} config - Configuration object containing the necessary information to query and process the retrieved data.
 * @param {boolean} noCache - clear http cache to get most recent document.
 * @return {Promise<{array, array}>} Map objects containing the retrieved data
 * and all possible keys representing the properties contained in the maps.
 */
export async function queryResource(config, noCache = false) {
    const myEngine = new QueryEngine();
    if (noCache){
        await myEngine.invalidateHttpCache();
    }
    const results = [];
    const keys = new Set();
    const query = config.query !== undefined ? config.query : configToSPARQLQuery(config);

    const result = await myEngine.query(query, {
        sources: [config.source],
    });

    const stream = await result.execute();

    stream.on('data', (binding) =>  {
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
export async function getNotificationChannelTypes(url){
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
 * @param {Object} config - Configuration object containing the necessary information build the SPARQL query (required and optional fields).
 * @return {String} The constructed SPARQL query.
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
 * @param {[quad]} deleted - String of N-Triples that should be deleted from the resource.
 * @param {[quad]} added - String of N-Triples that should be added to the resource.
 * @param {String} url - URL of the resource on which the additions and deletions should be executed.
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

    const response = await fetch(url, {
        method: 'PATCH',
        headers: {'Content-Type': 'text/n3'},
        body: update
    });

    if (response.ok) {
        console.log("Synchronization done.");
    } else if (response.status === 401) {
        console.error(`Synchronization failed. Insufficient write permissions on resource ${url}`);
    } else {
        console.error("Synchronization failed.");
    }
}

/**
 * Convert an array of quads into a string of N-triples.
 * @param {[quad]} quads - Array of quads that should be converted.
 * @returns {Promise<String>} String of N-triples.
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
