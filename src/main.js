import {compareArrays, compareQuads, onlyInLeft, rowsToObjects} from './util.js';
import {checkSheetForChanges, makeClient, writeToSheet} from './google.js';
import {load} from 'js-yaml';
import {objectsToRdf, yarrrmlToRml} from './rdf-generation.js';
import {getNotificationChannelTypes, getWebsocket, queryResources, setupAuth, updateResource} from './solid.js';
import {readFile} from 'fs/promises';
import {Quad} from 'n3';

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
    throw new Error('Error parsing YAML: either fields or a SPARQL query should be given');
  }

  if (configJson.resource) {
    config.source = configJson.resource;
    config.multiple = false;
    config.cacheComparator = compareArrays;
    config.diffChecker = onlyInLeft;
    config.resourceUpdater = (del, add) => updateResource(del, add, config.source);
  } else if (configJson.resources) {
    config.multiple = true;
    config.resourceHostmap = configJson.resources.map((object) => {
      return {
        resource: object.resource,
        host: object.host
      };
    });
    config.cacheComparator = (first, second, comparator) => {
      const firstKeys = Object.keys(first);
      const secondKeys = Object.keys(second);
      if (firstKeys.length !== secondKeys.length) {
        return false;
      }
      const result = firstKeys.every((entry) => secondKeys.includes(entry));
      if (!result) {
        return false;
      }
      return firstKeys.every((entry) => compareArrays(first[entry], second[entry], comparator));
    };
    config.diffChecker = (left, right, cmp) => {
      // The assumption is made that the structures of left and right object are the same.
      const leftKeys = Object.keys(left);
      const out = {};
      leftKeys.forEach((key) => out[key] = onlyInLeft(left[key], right[key], cmp));
      return out;
    };
    config.resourceUpdater = multipleResourceUpdater;
  } else {
    throw new Error('Error parsing YAML: At least 1 resource must be specified');
  }

  if (configJson.sheet.id) {
    config.sheetid = configJson.sheet.id;
  } else {
    throw new Error('Error parsing YAML: Google sheet id should be specified');
  }

  if (configJson.sheet.name) {
    config.sheetName = configJson.sheet.name;
  } else {
    throw new Error('Error parsing YAML: Google sheet name should be specified');
  }

  if (!config.multiple) {
    if (configJson.host) {
      config.host = configJson.host;
    } else {
      throw new Error('Error parsing YAML: host value should be specified');
    }
  }

  if (configJson.websockets) {
    config.noWebsockets = configJson.websockets === 'false';
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

  await setupAuth();

  // Cold start
  ymlContentToConfig(configYml);
  const {results, keys} = await queryResources(config, true);
  if (Object.keys(results).length === 0) {
    console.error('Failed cold start, no data collected from pod');
    return;
  }
  config.keys = [...keys];
  const arrays = mapsTo2DArray(results);
  await makeClient();
  const rows = await writeToSheet(arrays, config.sheetid, config.sheetName);
  const maps = rowsToObjects(rows);
  previousData = await objectsToRdf(config, {data: maps}, rml);
  if((Array.isArray(previousData) && previousData.length === 0) || Object.keys(previousData).length === 0) {
    console.error('Failed cold start. Something went wrong.');
    return;
  }
  console.log('Synchronisation cold start completed');

  let allOnWebsockets;
  if (!config.multiple) {
    allOnWebsockets = await setupResourceListening(config.host, config.source);
  } else {
    // try to set up a websocket connection for each resource
    const result = await Promise.all(config.resourceHostmap.map(async (entry) => await setupResourceListening(entry.host, entry.resource)));
    allOnWebsockets = result.every((e) => e);
  }
  if (!allOnWebsockets) {
    console.log('Not all resources supported websocket listening. A timer will be used to poll the resources.');
    // polling using timers
    setInterval(updateSheet, config.interval);
  } else {
    console.log('All resources are monitored using websockets.');
  }

  // Sheet -> Pod sync
  setInterval(async () => {
    const {rows, hasChanged} = await checkSheetForChanges(config.sheetid, config.sheetName);
    if (hasChanged) {
      console.log('Changes detected. Synchronizing...');
      const maps = rowsToObjects(rows);

      const quads = await objectsToRdf(config, {data: maps}, rml);
      if((Array.isArray(quads) && quads.length === 0) || Object.keys(quads).length === 0) {
        console.error('Failed to Synchronize.');
        return;
      }
      const deletedQuads = config.diffChecker(previousData, quads, compareQuads);
      const addedQuads = config.diffChecker(quads, previousData, compareQuads);
      previousData = quads;
      await config.resourceUpdater(deletedQuads, addedQuads);
    }
  }, config.interval);
}

/**
 * Tries to set up resource listening using websockets.
 * @param {string} host - Host of the resource, used to gather websocket endpoints.
 * @param {string} src - Resource url.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
async function setupResourceListening(host, src) {
  // Pod -> Sheet sync
  const websocketEndpoints = await getNotificationChannelTypes(host + '/.well-known/solid');
  if (websocketEndpoints.length > 0 && websocketEndpoints[0].length > 0 && (!config.noWebsockets)) {
    // listen using websockets
    const url = websocketEndpoints[0];
    const ws = await getWebsocket(url, src);
    ws.on('message', async (notification) => {
      const content = JSON.parse(notification);
      if (content.type === 'Update') {
        const res = await updateSheet();
        if (!res) {
          console.log(`Got a websocket ping from ${src}, but the latest changes were already present.`);
        }
      }
    });
    return true;
  }
  return false;
}

/**
 * Queries resource and writes changes to sheet.
 * @returns {Promise<boolean>} True if there was new data written to the sheet, false if not.
 */
async function updateSheet() {
  const {results} = await queryResources(config, true);
  const arrays = mapsTo2DArray(results);
  const maps = rowsToObjects(arrays);
  const quads = await objectsToRdf(config, {data: maps}, rml);
  if((Array.isArray(quads) && quads.length === 0) || Object.keys(quads).length === 0) {
    return false;
  }
  if (!config.cacheComparator(quads, previousData, compareQuads)) {
    const rows = await writeToSheet(arrays, config.sheetid, config.sheetName);
    const maps2 = rowsToObjects(rows);
    previousData = await objectsToRdf(config, {data: maps2}, rml);
    return true;
  }
  return false;
}

/**
 * Updates the resources specified in the config (multi-resource mode).
 * @param {Record<string, Quad[]>} del - Pair of resource and list of quads to delete.
 * @param {Record<string, Quad[]>} add - Pair of resource and list of quads to add.
 * @returns {Promise<void>}
 */
async function multipleResourceUpdater(del, add) {
  const keys = new Set();
  const delKeys = Object.keys(del);
  const addKeys = Object.keys(add);
  delKeys.forEach((entry) => keys.add(entry));
  addKeys.forEach((entry) => keys.add(entry));
  for (const key of keys) {
    if (key === 'stdout') {
      continue;
    }
    let d = [];
    let a = [];
    if (delKeys.includes(key)) {
      d = del[key];
    }
    if (addKeys.includes(key)) {
      a = add[key];
    }
    let found = false;
    for (const resourceHostmapElement of config.resourceHostmap) {
      if (resourceHostmapElement.resource.endsWith(key)) {
        found = true;
        await updateResource(d, a, resourceHostmapElement.resource);
        break;
      }
    }
    if (!found) {
      console.error(`[ERROR]\tCould not find resource to update for key ${key}`);
    }
  }
}

/**
 * This function starts the agent.
 */
function main() {
  startFromFile('config.yml', 'rules.yml');
}

main();
