# UiPath processes in a SOA
Exposes Orchestrator processes as REST APIs, including CRUD when certain criteria are met

## Running the server
node index.js

## Authentication
1. Go to http://localhost:8081/auth.html
2. Enter your Orchestrator API credentials. These can be found in https://cloud.uipath.com/ -> Admin -> Expand your tenant -> Click the Orchestrator API icon
3. Click submit

Alternatively you can call the "http://localhost:8081/auth" API endpoint just like we call it in "auth.html".

## How to use
Once authenticated, go to http://localhost:8081/ORGID/TENANTNAME/docs/ for the auto-generated swagger documenation.

Go to http://localhost:8081/ORGID/TENANTNAME/folders.html to browse through your folders and processes in your browser.

When viewing a process, you will be able to start it right from your browser. 

!Important!
Leaving the CallBack URL empty will result in a sync call. Otherwise the call will be async and you'll be called back on that URL when the process finishes execution.

# Endpoints

`GET http://localhost:8081/auth`

Authenticates the current user - you can see an example of calling it in auth.html

Note: To call any futher API, a Bearer-based authentication token bust be sent (it is returned from the auth call)

`GET http://localhost:8081/ORGID/TENANTNAME/status`

Returns the status of the current authentication session. Once auth is done, we fetch the full list of folders and processes from Orchestrator. This list is then cached for that connection. The status returns "loaded" once the list is done fetching and caching. You can see an example of calling this API in auth.html

`GET http://localhost:8081/ORGID/TENANTNAME/refresh`

Refreshes the list of folders and processes

`GET http://localhost:8081/ORGID/TENANTNAME/folders/`

Returns a list of root folders

`GET http://localhost:8081/ORGID/TENANTNAME/folders/FOLDERA`

Returns a list of sub-folders for "FOLDERA", together with a list of processes available in that folder

`GET http://localhost:8081/ORGID/TENANTNAME/processes/FOLDERA/PROCESSNAME`

Returns details for PROCESSNAME that exists in FOLDERA

`POST http://localhost:8081/ORGID/TENANTNAME/processes/FOLDERA/PROCESSNAME`

Starts PROCESSNAME and waits for the response

`POST http://localhost:8081/ORGID/TENANTNAME/processes/FOLDERA/PROCESSNAME` - with a "\_callBackURL" POST parameter

Starts PROCESSNAME and returns the Job ID. the callback url is called once the job finishes.

`GET http://localhost:8081/ORGID/TENANTNAME/jobs/1234`

Returns the status for the job ID 1234. Use this API fol polling for job status.

## Creating CRUD endpoints
Each folder can be transformed in a CRUD endpoint assuming one of the following conditions:
* A process called "list" exists in this folder. When a GET API call is executed against that folder, the "list" process will run
* A process called "create" exists in this folder. When a POST API call is executed against this folder, the "create" process will run
* A process called "read" exists in this folder. When a GET API call is executed against this folder/id, the "read" process will run. This process must define an "id" input argument
* A process called "update" exists in this folder. When a PATCH API call is executed against this folder/id, the "update" process will run. This process must define an "id" input argument
* A process called "delete" exists in this folder. When a DELETE API call is executed against this folder/id, the "delete" process will run. This process must define an "id" input argument

Here is an example:

Say we have a folder called "university" with a sub-folder called "students".
If in this folder we have the following 5 proceses: list, create, read, update, delete, the following end-points will be auto-generated and mapped to their respective processes:

`GET http://localost:8081/ORGID/TENANTNAME/entities/university/students/`

starts the "list" process

`POST http://localost:8081/ORGID/TENANTNAME/entities/university/students/`

starts the "create" process, and the POST arguments are mapped to the process's input arguments

`GET http://localost:8081/ORGID/TENANTNAME/entities/university/students/12345`

starts the "read" process with the "id" argument equals to "12345"

`PATCH http://localost:8081/ORGID/TENANTNAME/entities/university/students/12345`

starts the "update" process with the "id" argument equals to "12345", plus the other POST arguments mapped to the process's input args

`DELETE http://localost:8081/ORGID/TENANTNAME/entities/university/students/12345`

starts the "delete" process with the "id" argument equals to "12345"

Each one of the above API calls can also receive a query parameter called "\_callBackURL". When set, the call is executed async and the callback is called when the process execution ends.

Most of the above explanations can also be found in the auto-generated swagger file. Here is an example:

![](https://content.screencast.com/users/BogdanCR/folders/Capture/media/bf22cdfe-ef9c-45b2-aac7-ed27356fe965/LWR_Recording.png "Swagger CRUD")

