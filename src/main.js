import {checkSheetForChanges, makeClient, writeToSheet} from "./google.js";
import {load} from "js-yaml";
import {objectsToRdf, yarrrmlToRml} from "./rdf-generation.js";
import {getNotificationChannelTypes, queryResource, updateResource} from "./solid.js";
import {readFile} from 'fs/promises'
import {WebSocket} from 'ws';
import {compareArrays, getWebsocketRequestOptions} from "./util.js";

// Object containing information relating to the configuration of the synchronisation app.
let config = {};

// Array containing all quads on the sheet when the last change was detected.
let previousQuads;
let previousMap;

/**
 * Parse YAML data and store it in the configuration object.
 * @param {string} ymlContent - String containing the contents of a YAML file.
 */
function ymlContentToConfig(ymlContent) {
    const configJson = load(ymlContent);

    if (configJson.fields) {
        if (configJson.fields.required) {
            const requiredFields = {};
            configJson.fields.required.forEach((field) => {
                const [name, value] = Object.entries(field)[0];
                requiredFields[name] = value;
            });
            config.required = requiredFields;
        }

        if (configJson.fields.optional) {
            const optionalFields = {};
            configJson.fields.optional.forEach((field) => {
                const [name, value] = Object.entries(field)[0];
                optionalFields[name] = value;
            });
            config.optional = optionalFields;
        }
    } else if (configJson.query) {
        config.query = configJson.query;
    } else {
        throw new Error("Error parsing YAML: either fields or a SPARQL query should be given");
    }

    if (configJson.resource) {
        config.source = configJson.resource;
    } else {
        throw new Error("Error parsing YAML: source must be specified");
    }

    if (configJson.sheet.id) {
        config.sheetid = configJson.sheet.id;
    } else {
        throw new Error("Error parsing YAML: Google sheet id should be specified");
    }

    if (configJson.sheet.name) {
        config.sheetName = configJson.sheet.name
    } else {
        throw new Error("Error parsing YAML: Google sheet name should be specified")
    }

    if (configJson.host) {
        config.host = configJson.host
    } else {
        throw new Error("Error parsing YAML: host value should be specified")
    }

    if (configJson.debug){
        if (configJson.debug.websockets) {
            config.debug_noWebSockets = configJson.debug.websockets === "false"
        }
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

/**
 * Convert a 2D-array into objects using the first row as keys.
 * @param {[Array]} arrays - 2D-array that should be converted.
 * @return {[Object]} converted objects.
 */
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
 * @param {String} configPath - Path of the configuration file.
 * @param {String} rulesPath - Path of the rules file.
 */
async function startFromFile(configPath, rulesPath) {
    let configYml;

    try {
        configYml = await readFile(configPath, 'utf-8');
    } catch (error) {
        console.error(`Error reading the configuration file [${configPath}]`);
        process.exit(1);
    }

    let yarrrml;

    try {
        yarrrml = await readFile(rulesPath, 'utf-8');
    } catch (error) {
        console.error(`Error reading the rules file [${rulesPath}]`);
        process.exit(1);
    }

    const rml = await yarrrmlToRml(yarrrml);

    // Cold start
    ymlContentToConfig(configYml);
    const {results, keys} = await queryResource(config);
    config.keys = [...keys]
    const arrays = mapsTo2DArray(results);
    await makeClient();
    const rows = await writeToSheet(arrays, config.sheetid);
    const maps = rowsToObjects(rows);
    previousMap = maps;
    previousQuads = await objectsToRdf({data: maps}, rml);


    console.log("Synchronisation cold start completed");
    // Pod -> Sheet sync

    let websocket_endpoints = await getNotificationChannelTypes(config.host + "/.well-known/solid");

    if (websocket_endpoints.length > 0 && websocket_endpoints[0].length > 0 && (!config.debug_noWebSockets)) {
        // listen using websockets
        let url = websocket_endpoints[0]
        let requestOptions = getWebsocketRequestOptions(config.source)

        let response = await (await fetch(url, requestOptions)).json()
        let endpoint = response["receiveFrom"];
        const ws = new WebSocket(endpoint);
        ws.on("message", async (notification) => {
            let content = JSON.parse(notification);
            if (content.type === "Update") {
                const {results} = await queryResource(config, true);
                const arrays = mapsTo2DArray(results);
                const maps = rowsToObjects(arrays);
                if (!compareArrays(maps, previousMap)) {
                    const rows = await writeToSheet(arrays, config.sheetid);
                    const maps2 = rowsToObjects(rows);
                    previousMap = maps2;
                    previousQuads = await objectsToRdf({data: maps2}, rml);
                } else {
                    console.log("got notified but the latest changes are already present");
                }
            }
        })
    } else {
        // polling using timers
        setInterval(async () => {
            const {results} = await queryResource(config, true);
            const arrays = mapsTo2DArray(results);
            const maps = rowsToObjects(arrays);
            if (!compareArrays(maps, previousMap)) {
                const rows = await writeToSheet(arrays, config.sheetid);
                const maps2 = rowsToObjects(rows);
                previousMap = maps2;
                previousQuads = await objectsToRdf({data: maps2}, rml);
            }
        }, config.interval);
    }

    // Sheet -> Pod sync
    setInterval(async () => {
        const {rows, hasChanged} = await checkSheetForChanges(config.sheetid, config.sheetName);
        if (hasChanged) {
            console.log("Changes detected. Synchronizing...");
            const maps = rowsToObjects(rows);
            previousMap = maps;

            const quads = await objectsToRdf({data: maps}, rml);

            const deletedQuads = onlyInLeft(previousQuads, quads, compareQuads);
            const addedQuads = onlyInLeft(quads, previousQuads, compareQuads);
            previousQuads = quads;

            await updateResource(deletedQuads, addedQuads, config.source);
        }
    }, config.interval);
}

function main() {
    startFromFile("config.yml", "rules.yml");
}

main();
