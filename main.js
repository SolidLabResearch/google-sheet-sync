import {load} from "js-yaml";
import fs from 'fs';
import {queryResource} from "./solid.js";
import {writeToSheet} from "./google.js";

let config = {};

function ymlContentToConfig(ymlContent) {
    try {
        const parsedYml = load(ymlContent);

        if (parsedYml.resource && parsedYml.resource.fields) {
            if (parsedYml.resource.fields.required) {
                const requiredFields = {};
                parsedYml.resource.fields.required.forEach((field) => {
                    const [name, value] = Object.entries(field)[0];
                    requiredFields[name] = value;
                });
                config.required = requiredFields;
            } else {
                console.error("Error parsing YML: at least one required field should be given")
            }

            if (parsedYml.resource.fields.optional) {
                const optionalFields = {};
                parsedYml.resource.fields.optional.forEach((field) => {
                    const [name, value] = Object.entries(field)[0];
                    optionalFields[name] = value;
                });
                config.optional = optionalFields;
            }
        } else if (parsedYml.resource.query) {
            config.query = parsedYml.resource.query;
        } else {
            console.error("Error parsing YML: either fields or a SPARQL query should be given");
        }

        if (parsedYml.resource.sources) {
            config.sources = parsedYml.resource.sources;
        } else {
            console.error("Error parsing YML: at least one source must be specified");
        }

        if (parsedYml.sheet.id) {
            config.sheetid = parsedYml.sheet.id;
        } else {
            console.error("Error parsing YML: Google sheet id should be specified");
        }

    } catch (error) {
        console.error('Error parsing YML:', error);
    }
}

function startFromFile(path) {
    fs.readFile(path, 'utf8', async (err, data) => {
        if (err) {
            console.error('Error reading the file:', err);
        } else {
            ymlContentToConfig(data);
            await queryResource(config, mapsTo2DArray);
        }
    });
}

async function mapsTo2DArray(maps) {
    let arrays = [];
    let array = [];

    for (const key in config.required) {
        array.push(key.toUpperCase());
    }

    for (const key in config.optional) {
        array.push(key.toUpperCase());
    }
    arrays.push(array);

    for (let i = 0; i < maps.length; i++) {
        let array = [];
        for (const key in config.required) {
            array.push(maps[i].get(key));
        }

        for (const key in config.optional) {
            if (maps[i].has(key)) {
                array.push(maps[i].get(key));
            } else {
                array.push('');
            }
        }

        arrays.push(array);
    }
    console.log(arrays)
    await writeToSheet(arrays, config.sheetid)
}

async function main() {
    await startFromFile("config.yml");
}

main().then();
