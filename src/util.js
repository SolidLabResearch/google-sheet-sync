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
    let equal = true
    first.forEach((element) => {
        if (second.filter((entry) => shallowEqual(entry, element)).length === 0){
            equal = false;
        }
    })
    second.forEach((element) => {
        if(first.filter((entry) => shallowEqual(entry, element)).length === 0) {
            equal = false;
        }
    })
    return equal;
}