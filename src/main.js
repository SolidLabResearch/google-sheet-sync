import {checkSheetForChanges, makeClient, writeToSheet} from "./google.js";
import {load} from "js-yaml";
import {objectsToRdf, yarrrmlToRml} from "./rdf-generation.js";
import {getNotificationChannelTypes, queryResource, updateResource} from "./solid.js";
import {readFile} from 'fs/promises'
import {WebSocket} from 'ws';
import {compareArrays, getWebsocketRequestOptions, removeTrailingSlashes} from "./util.js";
import {Quad} from "n3";

// Object containing information relating to the configuration of the synchronisation app.
const config = {};

// global variable to store RML data for the queries
let rml;

// Array containing all the data on the sheet when the last change was detected.
let previousData;

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
    config.source = removeTrailingSlashes(configJson.resource);
    config.multiple = false;
    config.cacheComparator = compareArrays;
    config.diffChecker = onlyInLeft;
    config.updater = (del, add) => updateResource(del, add, config.source)
  } else if (configJson.resources) {
    config.multiple = true;
    config.resource_hostmap = configJson.resources.map((object) => {
      return {
        resource: removeTrailingSlashes(object.resource),
        host: removeTrailingSlashes(object.host)
      }
    })
    console.log(config.resource_hostmap);
    config.cacheComparator = (first, second, comparator) => {
      const firstKeys = Object.keys(first);
      const secondKeys = Object.keys(second);
      if(firstKeys.length !== secondKeys.length){
        return false;
      }
      const result = firstKeys.every((entry) => secondKeys.includes(entry))
      if (!result){
        return false;
      }
      return firstKeys.every((entry) => compareArrays(first[entry], second[entry], comparator))
    }
    config.diffChecker = (left, right, cmp) => {
      // the assumption is made that the structures of left and right are the same
      const leftKeys = Object.keys(left);
      const out = {}
      leftKeys.forEach((key) => out[key] = onlyInLeft(left[key], right[key], cmp))
      return out;
    }
    config.updater = async (del, add) => {
      const keys = new Set()
      const delKeys = Object.keys(del)
      const addKeys = Object.keys(add)
      delKeys.forEach((entry) => keys.add(entry));
      addKeys.forEach((entry) => keys.add(entry));
      for (const index of keys) {
        if(index === "stdout"){
          continue;
        }
        let d = [];
        let a = [];
        if (delKeys.includes(index)) {
          d = del[index]
        }
        if (addKeys.includes(index)) {
          a = add[index];
        }
        const int_index = Number.parseInt(index);
        console.log(config.resource_hostmap[int_index].resource)
        console.log(d);
        console.log(a)
        await updateResource(d, a, config.resource_hostmap[int_index].resource)
      }
    }
  } else {
    throw new Error("Error parsing YAML: At least 1 resource must be specified");
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

  if (!config.multiple) {
    if (configJson.host) {
      config.host = removeTrailingSlashes(configJson.host)
    } else {
      throw new Error("Error parsing YAML: host value should be specified")
    }
  }

  if (configJson.websockets) {
    config.noWebsockets = configJson.websockets === "false"
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

  rml = await yarrrmlToRml(yarrrml);

  // Cold start
  ymlContentToConfig(configYml);
  const {results, keys} = await queryResource(config);
  config.keys = [...keys]
  const arrays = mapsTo2DArray(results);
  await makeClient();
  const rows = await writeToSheet(arrays, config.sheetid, config.sheetName);
  const maps = rowsToObjects(rows);
  previousData = await objectsToRdf(config, {data: maps}, rml);
  console.log("Synchronisation cold start completed");

  if (!config.multiple) {
    const status = await setupResourceListening(config.host, config.source);
    if (!status) {
      setInterval(async () => {
        const {results} = await queryResource(config, true);
        const arrays = mapsTo2DArray(results);
        const maps = rowsToObjects(arrays);
        const quads = await objectsToRdf(config, {data: maps}, rml);
        if (!config.cacheComparator(quads, previousData, compareQuads)) {
          const rows = await writeToSheet(arrays, config.sheetid, config.sheetName);
          const maps2 = rowsToObjects(rows);
          previousData = await objectsToRdf(config, {data: maps2}, rml);
        }
      }, config.interval);
    }
  } else {
    // try to setup a websocket connection for each resource
    const result = await Promise.all(config.resource_hostmap.map(async (entry) => await setupResourceListening(entry.host, entry.resource)))
    const all_on_websockets = result.every((e) => e);
    if (!all_on_websockets) {
      console.log("not all resources supported websockets, polling using timer")
      // polling using timers
      setInterval(async () => {
        const {results} = await queryResource(config, true);
        const arrays = mapsTo2DArray(results);
        const maps = rowsToObjects(arrays);
        const quads = await objectsToRdf(config, {data: maps}, rml);
        if (!config.cacheComparator(quads, previousData, compareQuads)) {
          const rows = await writeToSheet(arrays, config.sheetid, config.sheetName);
          const maps2 = rowsToObjects(rows);
          previousData = await objectsToRdf(config, {data: maps2}, rml);
        }
      }, config.interval);
    } else {
      console.log("all resources are monitored using websockets");
    }
  }

  // Sheet -> Pod sync
  setInterval(async () => {
    const {rows, hasChanged} = await checkSheetForChanges(config.sheetid, config.sheetName);
    if (hasChanged) {
      console.log("Changes detected. Synchronizing...");
      const maps = rowsToObjects(rows);

      const quads = await objectsToRdf(config, {data: maps}, rml);

      const deletedQuads = config.diffChecker(previousData, quads, compareQuads);
      const addedQuads = config.diffChecker(quads, previousData, compareQuads);
      previousData = quads;
      await config.updater(deletedQuads, addedQuads);
    }
  }, config.interval);
}

/**
 * @param {string} host - host of the resource, used to gather websocket endpoints
 * @param {string} src - resource url
 * @returns {Promise<boolean>} - true when using websockets, false when using a timer.
 */
async function setupResourceListening(host, src) {
  // Pod -> Sheet sync
  const websocketEndpoints = await getNotificationChannelTypes(host + "/.well-known/solid");

  if (websocketEndpoints.length > 0 && websocketEndpoints[0].length > 0 && (!config.noWebsockets)) {
    // listen using websockets
    const url = websocketEndpoints[0]
    const requestOptions = getWebsocketRequestOptions(src)

    const response = await (await fetch(url, requestOptions)).json()
    const endpoint = response["receiveFrom"];
    const ws = new WebSocket(endpoint);
    ws.on("message", async (notification) => {
      const content = JSON.parse(notification);
      if (content.type === "Update") {
        const {results} = await queryResource(config, true);
        const arrays = mapsTo2DArray(results);
        const maps = rowsToObjects(arrays);
        const quads = await objectsToRdf(config, {data: maps}, rml);
        if (!config.cacheComparator(quads, previousData, compareQuads)) {
          const rows = await writeToSheet(arrays, config.sheetid, config.sheetName);
          const maps2 = rowsToObjects(rows);
          previousData = await objectsToRdf(config, {data: maps2}, rml);
        } else {
          console.log(`[${src}]\tgot notified but the latest changes are already present`);
        }
      }
    })
    return true;
  }
  return false;
}

/**
 *
 */
function main() {
  startFromFile("config.yml", "rules.yml");
}

main();
