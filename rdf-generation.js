import pkg from '@rmlio/yarrrml-parser/lib/rml-generator.js';
import {Parser, Writer} from 'n3';

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

    const text =  await response.text();
    return await parseRdfText(JSON.parse(text).output);
}

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

export async function yarrrmlToRml(yarrrml) {
    const generator = new pkg({includeMetadata: false});
    const quads = generator.convert(yarrrml);
    const writer = new Writer();
    for (const quad of quads) {
        writer.addQuad(quad.subject, quad.predicate, quad.object, quad.graph);
    }

    return new Promise((resolve) => {
        writer.end(async (error, result) => {
            resolve(result);
        });
    });
}