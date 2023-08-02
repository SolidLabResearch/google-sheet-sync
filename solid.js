import {QueryEngine} from "@comunica/query-sparql";
import {Writer} from "n3";

/**
 * Query the data from the Solid pod/resource(s) using the configuration
 * @param {Object} config - Configuration object containing the necessary information to query and process the retrieved data.
 * @return {Promise<{array, array}>} Map objects containing the retrieved data
 * and all possible keys representing the properties contained in the maps.
 */
export async function queryResource(config) {
    const myEngine = new QueryEngine();
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
 * @param {String} deleted - String of N-Triples that should be deleted from the resource.
 * @param {String} added - String of N-Triples that should be added to the resource.
 * @param {String} url - URL of the resource on which the additions and deletions should be executed.
 */
export async function updateResource(deleted, added, url) {
    const deletedString = await joinQuads(deleted);
    const addedString = await joinQuads(added);

    const update = `@prefix solid: <http://www.w3.org/ns/solid/terms#>.
    _:rename a solid:InsertDeletePatch;
    solid:deletes {
    ${deletedString}
    };
    solid:inserts {
    ${addedString}
    }.
    `

    console.log(update);

    const response  = await fetch(url, {
        method: 'PATCH',
        headers: {'Content-Type': 'text/n3'},
        body: update
    });

    console.log(await response.text());
}

/**
 * Convert an array of quads into a string of N-triples.
 * @param {[quad]} quads - Array of quads that should be converted.
 * @returns {Promise<String>} String of N-triples.
 */
async function joinQuads(quads) {
    const writer = new Writer({format: 'N-Triples'});
    quads.forEach(quad => writer.addQuad(quad));

    return new Promise(resolve => {
        writer.end((error, result) => {
            resolve(result);
        })
    })
}
