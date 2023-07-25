import {load} from "js-yaml";
import fs from 'fs';
import {queryResource} from "./solid.js";
import {writeToSheet} from "./google.js";

// Object containing information relating to the configuration of the synchronisation app.
let config = {};

/**
 * Parse YAML data and write it to the configuration object.
 * @param {string} ymlContent - String containing the contents of a YAML file.
 */
function ymlContentToConfig(ymlContent) {
    const configJson = load(ymlContent);

    if (configJson.resource && configJson.resource.fields) {
        if (configJson.resource.fields.required) {
            const requiredFields = {};
            configJson.resource.fields.required.forEach((field) => {
                const [name, value] = Object.entries(field)[0];
                requiredFields[name] = value;
            });
            config.required = requiredFields;
        }

        if (configJson.resource.fields.optional) {
            const optionalFields = {};
            configJson.resource.fields.optional.forEach((field) => {
                const [name, value] = Object.entries(field)[0];
                optionalFields[name] = value;
            });
            config.optional = optionalFields;
        }
    } else if (configJson.resource.query) {
        config.query = configJson.resource.query;
    } else {
        throw new Error("Error parsing YAML: either fields or a SPARQL query should be given");
    }

    if (configJson.resource.sources) {
        config.sources = configJson.resource.sources;
    } else {
        throw new Error("Error parsing YAML: at least one source must be specified");
    }

    if (configJson.sheet.id) {
        config.sheetid = configJson.sheet.id;
    } else {
        throw new Error("Error parsing YAML: Google sheet id should be specified");
    }
}

/**
 * Convert an array of Map objects into a 2D array.
 * @param {array} maps - An array of Map objects containing data to be converted to the 2D array.
 * @return {array} 2D array containing the converted data.
 */
function mapsTo2DArray(maps) {
    let arrays = [];
    let array = [];

    config.keys.forEach((key) => {
        array.push(key.toUpperCase());
    });
    arrays.push(array);

    maps.forEach((map) => {
        let array = [];

        config.keys.forEach((key) => {
            array.push(map.has(key) ? map.get(key) : '');
        });

        arrays.push(array);
    });

    console.log(arrays)
    return arrays;
}

/**
 * Start the synchronisation app from the path of the configuration file.
 * @param {String} path - Path of the configuration file.
 */
function startFromFile(path) {
    fs.readFile(path, 'utf8', async (err, data) => {
        if (err) {
            console.error('Error reading the file:', err);
            process.exit(1);
        } else {
            ymlContentToConfig(data);
            const {results, keys} = await queryResource(config);
            config.keys = [...keys]
            const arrays = mapsTo2DArray(results);
            await writeToSheet(arrays, config.sheetid)
        }
    });
}

function main() {
    startFromFile("config.yml");
}

main();
