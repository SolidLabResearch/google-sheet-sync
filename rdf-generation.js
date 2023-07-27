import pkg from '@rmlio/yarrrml-parser/lib/rml-generator.js';
import {Writer} from 'n3';

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

    return await response.text();
}

export async function yarrrmlToRml(yarrrml) {
    const generator = new pkg({includeMetadata: false});
    const quads = generator.convert(yarrrml);
    const writer = new Writer();
    for (const quad of quads) {
        writer.addQuad(quad.subject, quad.predicate, quad.object, quad.graph);
    }

    return new Promise((resolve, reject) => {
        writer.end(async (error, result) => {
            resolve(result);
        });
    });
}