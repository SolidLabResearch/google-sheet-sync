import pkg from '@rmlio/yarrrml-parser/lib/rml-generator.js';
import {Parser, Writer} from 'n3';

/**
 * Convert an array of objects into RDF data
 * @param {[Object]} data - Array of objects which should be converted into RDF
 * @param {String} rml - RML containing declarative rules on how to convert the objects into RDF.
 * @return {Promise<String>} - Converted RDF data.
 */
export async function objectsToRdf(data, rml) {
    const input = {
        sources: {
            "data.json": JSON.stringify(data)
        },
        rml
    }

    const response = await fetch('https://rml.io/api/rmlmapper/execute', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
    });

    const text = await response.text();
    return await parseRdfText(JSON.parse(text).output);
}


/**
 * Convert a String containing RDF data into quad objects.
 * @param {String} text - A string containing the RDF data.
 * @return {[quad]} Parsed quad objects.
 */
async function parseRdfText(text) {
    const parser = new Parser();

    return new Promise((resolve, reject) => {
        const quads = [];
        parser.parse(text, (error, quad) => {
            if (error) {
                reject(error);
            }

            if (quad) {
                quads.push(quad);
            } else {
                resolve(quads);
            }
        });
    });
}

/**
 * Convert yarrrml into RML.
 * @param {String} yarrrml - Yarrrml that should be converted into RML.
 * @return {Promise<String>} - Converted RML.
 */
export async function yarrrmlToRml(yarrrml) {
    const generator = new pkg({includeMetadata: false});
    const quads = generator.convert(yarrrml);

    const writer = new Writer();
    writer.addQuads(quads);

    return new Promise((resolve) => {
        writer.end(async (error, result) => {
            resolve(result);
        });
    });
}