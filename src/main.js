import {checkSheetForChanges, makeClient, writeToSheet} from "./google.js";
import {load} from "js-yaml";
import {objectsToRdf, yarrrmlToRml} from "./rdf-generation.js";
import {getNotificationChannelTypes, getWebsocket, queryResource, setupAuth, updateResource} from "./solid.js";
import {readFile} from 'fs/promises';
import {compareArrays} from "./util.js";
import {Quad} from "n3";

// Object containing information relating to the configuration of the synchronisation app.
const config = {};

// Array containing all quads on the sheet when the last change was detected.
let previousQuads;

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
    config.sheetName = configJson.sheet.name;
  } else {
    throw new Error("Error parsing YAML: Google sheet name should be specified");
  }

  if (configJson.host) {
    config.host = configJson.host;
  } else {
    throw new Error("Error parsing YAML: host value should be specified");
  }

  if (configJson.websockets) {
    config.noWebsockets = configJson.websockets === "false";
  }

  config.interval = configJson.sheet.interval ? configJson.sheet.interval : 5000;
}

/**
 * Convert an array of Map objects into a 2D array.
 * @param {Array} maps - An array of Map objects containing data to be converted to the 2D array.
 * @returns {Array} 2D array containing the converted data.
 */
function mapsTo2DArray(maps) {
  const arrays = [];
  const array = [];

  config.keys.forEach((key) => {
    array.push(key);
  });
  arrays.push(array);

  maps.forEach((map) => {
    const array = [];

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
 * @returns {[object]} converted objects.
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
 * @param {Quad} a - First quad object
 * @param {Quad} b - Second quad object
 * @returns {boolean} Boolean that indicate if the two quad objects are considered equal.
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
 * @param {string} configPath - Path of the configuration file.
 * @param {string} rulesPath - Path of the rules file.
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

  await setupAuth();

  // Cold start
  ymlContentToConfig(configYml);
  const {results, keys} = await queryResource(config, true);
  if (Object.keys(results).length === 0){
    console.error("Failed cold start, no data collected from pod");
    return;
  }
  config.keys = [...keys];
  const arrays = mapsTo2DArray(results);
  await makeClient();
  const rows = await writeToSheet(arrays, config.sheetid);
  const maps = rowsToObjects(rows);
  previousQuads = await objectsToRdf({data: maps}, rml);

  console.log("Synchronisation cold start completed");

  // Pod -> Sheet sync
  const websocketEndpoints = await getNotificationChannelTypes(config.host + "/.well-known/solid");

  if (websocketEndpoints.length > 0 && websocketEndpoints[0].length > 0 && (!config.noWebsockets)) {
    // listen using websockets
    const url = websocketEndpoints[0];
    const ws = await getWebsocket(url, config.source);
    ws.on("message", async (notification) => {
      const content = JSON.parse(notification);
      if (content.type === "Update") {
        const {results} = await queryResource(config, true);
        const arrays = mapsTo2DArray(results);
        const maps = rowsToObjects(arrays);
        const quads = await objectsToRdf({data: maps}, rml);
        if (!compareArrays(quads, previousQuads, compareQuads)) {
          const rows = await writeToSheet(arrays, config.sheetid);
          const maps2 = rowsToObjects(rows);
          previousQuads = await objectsToRdf({data: maps2}, rml);
        } else {
          console.log("got notified but the latest changes are already present");
        }
      }
    });
  } else {
    // polling using timers
    setInterval(async () => {
      const {results} = await queryResource(config, true);
      const arrays = mapsTo2DArray(results);
      const maps = rowsToObjects(arrays);
      const quads = await objectsToRdf({data: maps}, rml);
      if (!compareArrays(quads, previousQuads, compareQuads)) {
        const rows = await writeToSheet(arrays, config.sheetid);
        const maps2 = rowsToObjects(rows);
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

      const quads = await objectsToRdf({data: maps}, rml);

      const deletedQuads = onlyInLeft(previousQuads, quads, compareQuads);
      const addedQuads = onlyInLeft(quads, previousQuads, compareQuads);
      previousQuads = quads;

      await updateResource(deletedQuads, addedQuads, config.source);
    }
  }, config.interval);
}

/**
 *
 */
function main() {
  startFromFile("config.yml", "rules.yml");
}

main();
