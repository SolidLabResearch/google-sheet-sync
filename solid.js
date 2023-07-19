import {QueryEngine} from "@comunica/query-sparql";

export async function queryResource(config, callback) {
    const myEngine = new QueryEngine();

    const results = [];

    const query = config.query !== undefined ? config.query : configToSPARQLQuery(config);

    console.log("query: ", query)

    const result = await myEngine.query(query, {
        sources: config.sources,
    });

    const stream = await result.execute();

    stream.on('data', (binding) =>  {
        const entry = new Map();

        for (const key in config.required) {
            entry.set(key, binding.get(key).value);
        }

        for (const key in config.optional) {
            if (binding.has(key)) {
                entry.set(key, binding.get(key).value);
            }
        }
        results.push(entry);
    })

    stream.on('end', () => {
        callback(results);
    })
}

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
