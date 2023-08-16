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

export function compareArrays(first, second) {
    if(first.length !== second.length) {
        return false;
    }
    first.forEach((element) => {
        if (second.filter((entry) => shallowEqual(entry, element)).length === 0){
            return false;
        }
    })
    return true;
}

export function getWebsocketRequestOptions(source){
    let myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/ld+json");

    let raw = JSON.stringify({
        "@context": [
            "https://www.w3.org/ns/solid/notification/v1"
        ],
        "type": "http://www.w3.org/ns/solid/notifications#WebSocketChannel2023",
        "topic": source
    });

    return {
        method: 'POST',
        headers: myHeaders,
        body: raw,
        redirect: 'follow'
    };
}