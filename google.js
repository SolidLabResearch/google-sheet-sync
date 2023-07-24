import {config} from "dotenv";
import fs from 'fs';
import {google} from "googleapis"

/**
 * Make an authenticated Google client object to be used to access Google Cloud API's using the stored credentials.
 * @return {Object} Authenticated Google client object.
 */
async function makeClient() {
    config();
    const {GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET} = process.env;
    const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);

    const credentials = JSON.parse(fs.readFileSync('credentials.json', 'utf-8'))
    client.setCredentials(credentials);

    await client.refreshAccessToken();

    return client;
}

/**
 * Write a 2D array to a Google Sheet
 * @param {array} array - 2D array containing the data that should be written to the Google Sheet.
 * @param {String} sheetId - ID of the sheet to which the data should be written.
 */
export async function writeToSheet(array, sheetId) {

    const client = await makeClient();

    const sheets = google.sheets({
        version: 'v4',
        auth: client
    });

    try {
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

        console.log(`${response.data.updatedCells} cells updated.`);
    } catch (error) {
        console.error('The API returned an error:', error.message);
    }
}

/**
 * Give the cell reference of the last element in a 2D array.
 * @param {array} array - Array of which the cell reference of the last element should be given.
 * @return {string} Cell reference of the last element.
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