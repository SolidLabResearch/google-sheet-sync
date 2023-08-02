import fs from 'fs';
import {checkSheetForChanges, makeClient, writeToSheet} from "./google.js";
import {load} from "js-yaml";
import {objectsToRdf, yarrrmlToRml} from "./rdf-generation.js";
import {queryResource, updateResource} from "./solid.js";

// Object containing information relating to the configuration of the synchronisation app.
let config = {};

// Array containing all quads on the sheet when the last change was detected.
let previousQuads;

/**
 * Parse YAML data and store it in the configuration object.
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

    if (configJson.resource.source) {
        config.source = configJson.resource.source;
    } else {
        throw new Error("Error parsing YAML: source must be specified");
    }

    if (configJson.sheet.id) {
        config.sheetid = configJson.sheet.id;
    } else {
        throw new Error("Error parsing YAML: Google sheet id should be specified");
    }

    config.interval = configJson.sheet.interval ? configJson.sheet.interval : 5000;
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
        array.push(key);
    });
    arrays.push(array);

    maps.forEach((map) => {
        let array = [];

        config.keys.forEach((key) => {
            array.push(map.has(key) ? map.get(key) : '');
        });

        arrays.push(array);
    });

    return arrays;
}

function rowsToObjects(arrays) {
    const [keys, ...values] = arrays;
    const results = [];

    for (const valueSet of values) {
        const result = {};
        for (let i = 0; i < keys.length; i++) {
            if (valueSet[i]) {
                result[keys[i]] = valueSet[i];
            }
        }
        results.push(result);
    }

    return results;
}

/**
 * Determine if two Quad objects are considered equal.
 * @param {quad} a - First quad object
 * @param {quad} b - Second quad object
 * @return {boolean} Boolean that indicate if the two quad objects are considered equal.
 */
function compareQuads(a, b) {
    return a.equals(b);
}

/**
 * Give objects that are only present in one list but not in the other.
 * @param {Array} left - Array in which the objects should be present.
 * @param {Array} right - Array in which the objects should not be present.
 * @param {Function} compareFunction - Function to determine if two objects are considered equal.
 * @returns {Array} Collection of objects that are present in the 'left' array but not in the 'right' array.
 */
function onlyInLeft(left, right, compareFunction) {
    return left.filter(leftValue =>
        !right.some(rightValue =>
            compareFunction(leftValue, rightValue)));
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

            // Cold start
            ymlContentToConfig(data);
            const {results, keys} = await queryResource(config);
            config.keys = [...keys]
            const arrays = mapsTo2DArray(results);
            await makeClient();
            const rows = await writeToSheet(arrays, config.sheetid);
            const maps = rowsToObjects(rows);

            fs.readFile('yarrrml.yml', 'utf8', async (err, data) => {
                const rml = await yarrrmlToRml(data);
                previousQuads = await objectsToRdf({data: maps}, rml);
            });

            console.log("Synchronisation cold start completed");

            // Sheet -> Pod sync
            setInterval(async () => {
                const {rows, hasChanged} = await checkSheetForChanges(config.sheetid);
                if (hasChanged) {
                    console.log("Changes detected. Synchronizing...");
                    const maps = rowsToObjects(rows);
                    fs.readFile('yarrrml.yml', 'utf8', async (err, data) => {
                        const rml = await yarrrmlToRml(data);
                        const quads = await objectsToRdf({data: maps}, rml);

                        const deletedQuads = onlyInLeft(previousQuads, quads, compareQuads);
                        const addedQuads = onlyInLeft(quads, previousQuads, compareQuads);
                        previousQuads = quads;

                        await updateResource(deletedQuads, addedQuads, config.source);
                    });
                }
            }, config.interval);
        }
    });
}

function main() {
    startFromFile("config.yml");
}

main();
