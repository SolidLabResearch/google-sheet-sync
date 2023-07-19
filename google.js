import {config} from "dotenv";
import fs from 'fs';
import {google} from "googleapis"

async function makeClient() {
    config();
    const {GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET} = process.env;
    const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);

    const credentials = JSON.parse(fs.readFileSync('credentials.json', 'utf-8'))
    client.setCredentials(credentials);

    await client.refreshAccessToken();

    return client;
}

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
            range: range,
            valueInputOption: 'RAW',
            resource: resource,
        });

        console.log(`${response.data.updatedCells} cells updated.`);
    } catch (error) {
        console.error('The API returned an error:', error.message);
    }
}

function convertToCellIndex(array) {
    const column = String.fromCharCode(65 + (array[0].length - 1));
    const rowNumber = array.length;

    return column + rowNumber;
}