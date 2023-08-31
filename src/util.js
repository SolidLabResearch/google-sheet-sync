/**
 * Compares objects - checks keys and values
 * Called shallowEqual because javascript's `===` checks equality from objects on memory level, and not value level.
 * @param {object} obj1 - first object to compare
 * @param {object} obj2 - second object to compare
 * @returns {boolean} Boolean that indicates if the objects are equal
 */
export function shallowEqual(obj1, obj2) {
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) {
    return false;
  }

  for (const key of keys1) {
    if (!Object.hasOwn(obj2, key) || obj1[key] !== obj2[key]) {
      return false;
    }
  }

  return true;
}

/**
 * Compares 2 arrays and checks if they contain the same objects (order doesn't matter)
 * @param {object[]} first - first array of objects to compare
 * @param {object[]} second - second array of objects to compare
 * @param {function(object, object): boolean} comparator - comparator function to use. Defaults to shallowEqual
 * @returns {boolean} Boolean that indicates if the arrays are equal (not counting order)
 */
export function compareArrays(first, second, comparator = shallowEqual) {
  if (first.length !== second.length) {
    return false;
  }
  for (const element of first) {
    if (second.filter((entry) => comparator(entry, element)).length === 0) {
      return false;
    }
  }
  return true;
}

/**
 * Generates RequestOptions to establish a websocket connection for the source parameter resource
 * @param {string} source - resource to which a websocket should be provided.
 * @returns {{redirect: string, headers: Headers, method: string, body: string}} RequestOptions to request a websocket connection to source parameter
 */
export function getWebsocketRequestOptions(source) {
  const myHeaders = new Headers();
  myHeaders.append('Content-Type', 'application/ld+json');

  const raw = JSON.stringify({
    '@context': ['https://www.w3.org/ns/solid/notification/v1'],
    'type': 'http://www.w3.org/ns/solid/notifications#WebSocketChannel2023',
    'topic': source
  });

  return {
    method: 'POST', headers: myHeaders, body: raw, redirect: 'follow'
  };
}

/**
 * function to remove a possible trailing slash of a string
 * Used to clean up IRIs
 * @param {string} input - string to clean up
 * @returns {string} - cleaned up string
 */
export function removeTrailingSlashes(input){
  if(input.endsWith('/')){
    return input.slice(0, input.length - 1);
  }
  return input;
}