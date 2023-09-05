# Google Sheet Sync

Google Sheet Sync is an agent that allows a user to convert and synchronise data between a Google Sheet and a Solid pod.
It is based off of [this challenge](https://github.com/SolidLabResearch/Challenges/issues/120).
You find the latest screencast of the agent [here](https://cloud.ilabt.imec.be/index.php/s/SXyQ3986x3GfYyx).
You find a screencast of the first version [here](https://cloud.ilabt.imec.be/index.php/s/eFrEKF2YCkSx22j).

## Pods

To set up the CSS instances with pod data, run

```shell
npm run prepare:pods
```

To start the server, run

```shell
npm run start:pods
```

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

1) Make sure all dependencies have been installed by running `npm i`.
2) Run `npm run auth` to start the authentication web app.
3) Navigate to `http://localhost:8081/` (or another port if changed) in a browser.
4) Press "Authenticate" under the "Google" section.
5) Log in/select a Google account that has access to the Google Cloud project and/or is added as a test user
   if the project is not published yet.
6) When successful, the correct tokens have now been written to `credentials.json`.
   You find an example in `credentials.example.json`.

The synchronisation app can now read and use these tokes to access the Google Sheet with the Google Sheets API.

## Solid authentication

To set up authentication for Solid pods, you use the same authentication server as the OAuth2 setup.

1) Make sure all dependencies have been installed by running `npm i`.
2) Run `npm run auth` to start the authentication web app.
3) Navigate to `http://localhost:8081/` (or another port if changed) in a browser.
4) Fill in all the necessary information:
    - host server (Url of your [Community Solid Server](https://github.com/CommunitySolidServer/CommunitySolidServer)
    where your pod is located)
    - email for your pod
    - password for your pod
  
    The Solid instance that comes with this program is seeded with 1 pod by default. The default pod name is `example`.
The email is `hello@example.com` with password `abc123`. You can use these values to authenticate.
5) Press "Authenticate" under the "Solid Pod" section.
6) When successful, the correct tokens have now been written to `solid-credentials.json`.

## Configuration

The synchronisation application is configured through the `config.yml` file.

### Single resource mode

#### resource (string)

This parameter allows a user to specify a resource.
This resource should be represented as a URI to a Solid pod from which the data will be fetched.

#### host (string)

This parameter allows a user to specify the host of a resource.
This is required to use the websocket protocol to listen for changes on the resource.

example:

```yaml
resource: "http://localhost:3000/testing/software"
host: "http://localhost:3000"
```

### Multi resource mode

When querying multiple resources at the same time, use the following structure.

```yaml
resources:
   - resource: "http://localhost:3000/testing/ratings"
     host: "http://localhost:3000"
   - resource: "http://localhost:3000/testing/tv-shows"
     host: "http://localhost:3000"
```

Make sure that for every resource, you provide a host value. Because each resource could be on a different host.

You can find an example for multiple resources in the files `config.query-multiple.example.yml` and `rules-multiple.example.yml`

### query (string)

This parameter allows a user to define a SPARQL query that will be used to retrieve data from the specified data sources.

example:

```yaml
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

To find the id of your Google sheet, look at the URL of the Google Sheet in the address bar of your web browser.
The URL should look something like this:

```text
https://docs.google.com/spreadsheets/d/DOCUMENT_ID/edit#gid=0
```

Here, "DOCUMENT_ID" will be a long string of characters, letters, and numbers.
This is the unique identifier for the Google Sheet.

#### name (string)

This parameter allows you to specify a name for the Google sheet that should be read and/or altered. \
This is the name of the tab on the bottom left that you want to sync.

#### interval (int)

This parameter allows you to specify the number of milliseconds between polls.
The code will poll the sheet for changes after the specified number of milliseconds.
The code will also poll the pod after this amount of milliseconds when websockets aren't used.

example:

```yaml
sheet:
  id: "ABCD1234"
  name: "Sheet1"
  interval: 1000
```

### Using Fields for Data Retrieving

Instead of using a single, user defined SPARQL query as in the previous method, the user can use the `fields` option
to specify the specific fields you want to retrieve from the data source.
This method provides a more structured way of fetching data.

#### required (list)

This parameter allows you to specify a list of fields that must/should be present in
the retrieved RDF data on the resource.
Each field is represented as a key-value pair,
where the key is the field name and the value is the corresponding SPARQL predicate or URI.

example:

```yaml
fields:
 required:
   - name: "<http://schema.org/name>"
```

#### optional (list)

This parameter allows you to specify a list of fields that are optional in the retrieved RDF data on the resource(s).
Similar to required, each field is represented as a key-value pair.

example:

```yaml
fields:
 optional:
   - description: "<http://schema.org/description>"
   - logo: "<http://schema.org/logo>"
```

### Debug configurations

#### websockets

This parameter allows you to turn off websockets when you want explicit polling every 5 seconds.
The `interval` option from the Google Sheet configuration changes this value.

example:

```yaml
websockets: "false"
```

### Full examples

Full configuration examples that incorporate either the query or fields method are present in
`config.query.example.yml` and `config.fields.example.yml` respectively.

## Rules (YARRRML)

To convert and write back changes from the Google Sheet back to the resource, the synchronisation agent
uses the [RMLMapper](https://rml.io/). This mapper relies on declarative rules
that define how the RDF data should be generated from the data on the Google Sheet.
Write these rules in the form of [YARRRML](https://rml.io/yarrrml/) in the `rules.yml` file.

You are responsible that the Sheet data that is fed to the [RMLMapper](https://rml.io/)
contains enough information to be converted back to triples. The program itself keeps no track of
the origin of the separate pieces of data nor the entity to which they belong.

You find an example in `rules.example.yml`.

## Start synchronisation app

To set up and use the synchronisation agent, first make sure all the necessary dependencies have been installed by running

```shell
npm i
```

Afterward, start the agent by running

```shell
npm start
```

## Linting

ESLint linter set up for this project. To run the linter, execute the following command:

```shell
npm run lint:js
```

There is also a markdown linter set up for this project. To run, execute the following command:

```shell
npm run lint:markdown
```

or

```shell
npm run lint:markdown:fix
```

to apply automatic fixes.

## Technical assumptions

### No 2 applications write at the same time

Currently, it is not handled when the sheet and
another application try to update the resource in the pod at exactly the same time.
