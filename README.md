# Google Sheet Sync

Google Sheet Sync is an agent that allows a user to convert and synchronise data between a Google Sheet and a Solid pod.
It is based off of [this challenge](https://github.com/SolidLabResearch/Challenges/issues/120).

## Google Sheet API

To read and alter Google Sheets, we use the [Google Sheet API](https://developers.google.com/sheets/api/guides/concepts).
To access and use the Google Sheets API, one has to create/use a Google Cloud project.

These steps should be ignored if Google Sheets API OAuth2 client credentials (ID/secret pair) is supplied by an administrator.

1) Navigate to the [Google Cloud console](https://console.cloud.google.com/) and create a new project.
2) Go to "APIs & services" and press "Enable APIs and services".
3) Search for the Google Sheets API and press "Enable".
4) Before we can create any OAuth2 credentials,
   one has to set up the [OAuth consent screen](https://developers.google.com/workspace/guides/configure-oauth-consent)
   by pressing "OAuth consent screen" on the left side of the projects API's & services interface.
5) Select external user type.
6) Fill out the required fields. App logo and domain can be left empty. No scopes have to be specified either.
7) If the project is not yet published and still has the "Testing" status, the user should add themselves or be added
   as a test user, even if the user is the administrator/creator of the project.
8) Navigate to the Google Sheet API's Credentials interface by first navigating to the Google Sheets API that is listed under
   "Enabled APIs & services" and navigating to the "Credentials" tab. 
9) Press "Create credentials" and select "OAuth client ID". 
10) Select application type "Desktop app" and create the credentials.

After creating or receiving OAuth2 credentials, this ID/secret pair should be pasted to the `.env` file.
An example on how this should be done is present in `.example.env`.

## OAuth2 tokens

When a valid OAuth2 ID and secret is supplied, one still has to create an access token and refresh token to use the API.
To create these, follow these steps using the authentication app:

1) Run `npm run auth` to start the authentication web app.
2) Navigate to `http://localhost:5000/` (or another port if changed) in a browser.
3) press "Authenticate".
4) Log in/select a Google account that has access to the Google Cloud project and/or is added as a test user
   if the project is not published yet.
5) When successfull, the correct tokens have now been written to `credentials.json`.
   An example of how this should look like is present in `credentials.example.json`.

The synchronisation app can now read and use these tokes to access the Google Sheet with the Google Sheets API.


## Configuration

The synchronisation application is configurated through the `config.yml` file.

### Resource configuration
The `resource` section of the configuration file contains settings related to data sources and queries for the resource.

#### sources (list)
This parameter allows a user to specify a list of resources. 
Each resource should be represented as a URI to a Solid pod from which the data will be fetched.

example:
```yaml
resource:
  sources:
    - "https://data.knows.idlab.ugent.be/person/office/software"
```

#### query (string)
This parameter allows a user to define a SPARQL query that will be used to retrieve data from the specified data sources.

example:
```yaml
resource:
  query: >
    SELECT DISTINCT * WHERE {
        ?s <http://schema.org/name> ?name .
        OPTIONAL {?s <http://schema.org/description> ?description} .
        OPTIONAL {?s <http://schema.org/logo> ?logo} .
    }
```

### Google Sheet configuration
The `sheet` section of the configuration file contains settings related to a specific sheet.

#### id (string)
This parameter allows you to specify an id for the Google sheet that should be read and/or altered.

example:
```yaml
sheet:
  id: "ABCD1234"
```

To find the id of your Google sheet, Look at the URL of the Google Sheet in the address bar of your web browser.
The URL should look something like this:
```
https://docs.google.com/spreadsheets/d/DOCUMENT_ID/edit#gid=0
```

Here, "DOCUMENT_ID" will be a long string of characters, letters, and numbers. 
This is the unique identifier for the Google Sheet.


### Using Fields for Data Retrieving
Instead of using a single, user defined SPARQL query as in the previous method, the user can use the `fields` option 
to specify the specific fields you want to retrieve from the data source. 
This method provides a more structured way of fetching data.

#### required (list)
This parameter allows you to specify a list of fields that must/should be present in the retrieved RDF data on the resource(s). 
Each field is represented as a key-value pair, where the key is the field name and the value is the corresponding SPARQL predicate or URI.

example:
```yaml
resource:
  fields:
    required:
      - name: "<http://schema.org/name>"
```
#### optional (list)
This parameter allows you to specify a list of fields that are optional in the retrieved RDF data on the resource(s). 
Similar to required, each field is represented as a key-value pair.

example:
```yaml
resource:
  fields:
    optional:
      - description: "<http://schema.org/description>"
      - logo: "<http://schema.org/logo>"
```


### Full examples
Full configuration examples that incorporate either the query or fields method are present in 
`config.query.example.yml` and `config.fields.example.yml` respectively.

## Start synchronisation app
To set up and use the synchronisation agent, first make sure all the necessary dependencies have been installed by running
```shell
npm i
```

Afterwards, start the agent by running
```shell
npm start
```