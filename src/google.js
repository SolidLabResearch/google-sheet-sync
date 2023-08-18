import {config} from "dotenv";
import fs from 'fs';
import {google} from "googleapis"

// Authenticated Google Sheet API object.
let sheets;

// Array containing all the rows on the sheet when the last check for differences was made.
let previousRows;

/**
 * Make an authenticated Google client object to be used to access the Google Sheets API using the stored credentials.
 */
export async function makeClient() {
    config();
    const {GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET} = process.env;
    const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);

    const credentials = JSON.parse(fs.readFileSync('credentials.json', 'utf-8'))
    client.setCredentials(credentials);

    await client.refreshAccessToken();

    sheets = google.sheets({
        version: 'v4',
        auth: client
    });
}

/**
 * Write a 2D array to a Google Sheet
 * @param {array} array - 2D array containing the data that should be written to the Google Sheet.
 * @param {String} sheetId - ID of the sheet to which the data should be written.
 */
export async function writeToSheet(array, sheetId) {
    const range = 'A1:' + convertToCellIndex(array);
    console.log("range: ", range)

    const resource = {
        values: array,
    };

    const response = await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range,
        valueInputOption: 'RAW',
        resource: resource,
    });

    previousRows = array;

    console.log(`${response.data.updatedCells} cells updated.`);

    return array;
}

/**
 * Pull data from the sheet and check if there are any changes with the previously pulled data.
 * @param {String} sheetId - ID of the Google sheet from which the data should be pulled and checked.
 * @param {String} sheetName - Name of the Sheet page to check
 * @return {Promise<{Boolean, Array}>} - 2D-array containing the latest data from the sheet
 * and a boolean indicating a possible change.
 */
export async function checkSheetForChanges(sheetId, sheetName) {
    const rows = await getFromSheet(sheetId, sheetName);
    const hasChanged = previousRows !== undefined && !areArraysEqual(rows, previousRows);
    previousRows = rows;
    return {
        rows,
        hasChanged
    };
}

/**
 * Get the data from the sheet in the initial range.
 * @param {String} sheetId - ID from the sheet from which the data should be pulled.
 * @param {String} sheetName - Name of the Sheet page to check
 * @return {Promise<Array>} 2D-array containing the data from the sheet.
 */
async function getFromSheet(sheetId, sheetName) {
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: sheetName
    });

    return response.data.values;
}

/**
 * Give the cell reference of the last element in a 2D array.
 * @param {Array} array - Array of which the cell reference of the last element should be given.
 * @return {String} Cell reference of the last element.
 *
 * @example
 * const array = [["foo", "bar"], ["baz", "qux"]];
 * const reference = convertToCellIndex(array);
 *
 * console.log(reference);
 * // returns "B2"
 */
function convertToCellIndex(array) {
    const column = String.fromCharCode(65 + (array[0].length - 1));
    const rowNumber = array.length;

    return column + rowNumber;
}

/**
 * Check if two 2D-arrays are equal (including sequence).
 * @param {Array} arr1 - first 2D-array
 * @param {Array} arr2 - second 2D-array
 * @return {Boolean} Boolean indicating if the two 2D-arrays are equal.
 */
function areArraysEqual(arr1, arr2) {
    if (arr1.length !== arr2.length) {
        return false;
    }

    for (let i = 0; i < arr1.length; i++) {
        if (arr1[i].length !== arr2[i].length) {
            return false;
        }
        for (let j = 0; j < arr1[i].length; j++) {
            if (arr1[i][j] !== arr2[i][j]) {
                return false;
            }
        }
    }
    return true;
}