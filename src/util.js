/**
 * Compares objects - checks keys and values
 * @param {Object} obj1
 * @param {Object} obj2
 * @returns {boolean} Boolean that indicates if the objects are equal
 */
export function shallowEqual(obj1, obj2) {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) {
        return false;
    }

    for (let key of keys1) {
        if (!obj2.hasOwnProperty(key) || obj1[key] !== obj2[key]) {
            return false;
        }
    }

    return true;
}


/**
 * Compares 2 arrays and checks if they contain the same objects (order doesn't matter)
 * @param {Object[]} first
 * @param {Object[]} second
 * @param {function(Object, Object): boolean } comparator
 * @returns {boolean} Boolean that indicates if the arrays are equal (not counting order)
 */
export function compareArrays(first, second, comparator = shallowEqual) {
    if (first.length !== second.length) {
        return false;
    }
    first.forEach((element) => {
        if (second.filter((entry) => comparator(entry, element)).length === 0) {
            return false;
        }
    })
    return true;
}

/**
 * Generates RequestOptions to establish a websocket connection for the source parameter resource
 * @param {string} source - resource to which a websocket should be provided.
 * @return {{redirect: string, headers: Headers, method: string, body: string}} RequestOptions to request a websocket connection to source parameter
 */
export function getWebsocketRequestOptions(source) {
    let myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/ld+json");

    let raw = JSON.stringify({
        "@context": ["https://www.w3.org/ns/solid/notification/v1"],
        "type": "http://www.w3.org/ns/solid/notifications#WebSocketChannel2023",
        "topic": source
    });

    return {
        method: 'POST', headers: myHeaders, body: raw, redirect: 'follow'
    };
}