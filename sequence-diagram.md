# Sequence diagram

````mermaid
sequenceDiagram
    actor user as User
    participant resource as Resource
    participant sheet as Google sheet
    participant app as Sync app

    user -->> app: Configure app through config file
    user ->> app: Start the application
    app ->> resource: Query data
    resource -->> app: Return data
    app ->> app: Convert RDF data to 2D-array
    app ->> sheet: Fill sheet with data

    user ->> sheet: Edit one or more fields
    Note over resource,app: Listen/check for changes on sheet
    loop periodically
        app ->> sheet: Query data
        sheet -->> app: Return data
        app ->> app: Check for changes on data
        alt changes detected
            app ->> app: Convert changes to RDF data
            app ->> resource: Write changes
        end
    end

    user ->> resource: Make changes to the resource
    Note over resource,app: Listen/check for changes on resource
    loop periodically
        app ->> resource: Query data
        resource -->> app: Return data
        app ->> app: Check for changes on data
        alt changes detected
            app ->> app: Convert changes to array data
            app ->> sheet: Write changes
        end
    end
