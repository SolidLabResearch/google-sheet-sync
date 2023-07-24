import {QueryEngine} from "@comunica/query-sparql";

/**
 * Query the necessary data from the Solid pod/resource(s) using the configuration
 * @param {Object} config - Configuration object containing the necessary information to query and process the retrieved data.
 * @param {Function} callback - Function to call once the query is completed.
 */
export async function queryResource(config, callback) {
    const myEngine = new QueryEngine();

    const results = [];
    const keys = new Set();

    const query = config.query !== undefined ? config.query : configToSPARQLQuery(config);

    console.log("query: ", query)

    const result = await myEngine.query(query, {
        sources: config.sources,
    });

    const stream = await result.execute();

    stream.on('data', (binding) =>  {
        const result = new Map();
        binding.entries.forEach((value, key) => {
            keys.add(key)
            result.set(key, value.id);
        })
        results.push(result);
    })

    stream.on('end', () => {
        callback(results, keys);
    })
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
    return sparqlQuery;
}
