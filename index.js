const util = require('util');
const {cleanUpEntities} = require('./functions.js');
const Orchestrator = require('uipath-orchestrator');
const Orchestrator2 = require("./orchestrator-apis.js");
const cookieParser = require("cookie-parser");
const swaggerUi = require("swagger-ui-express");
const Swagger = require("./swagger.js");
const { Document, DType, Response, Operation, API } = require('swagger-generator-json')
const path = require("path");
const express = require('express');
const app = express();
const port = 8081;

var instances = {};
var callBacks = [];

function refreshInstanceTime(ad) {
	if (instances[ad.authToken])
		instances[ad.authToken].lastAccessed = Date.now();
}

function getAuthDetails(req) {
	var authToken;
	if (req.cookies && req.cookies.authToken)
		authToken = req.cookies.authToken
	else
		authToken = req.headers.Authorization.replace(/^Bearer\s+/, '');

	return {
		authToken: authToken,
		orgId: req.params.orgId,
		tenantName: req.params.tenantName
	}	
}

function getOrchestrator(ad) {
	var orchestrator = Orchestrator2.getOrchestrator(ad.tenantName, ad.authToken);

	if (!instances[ad.authToken]) {
		instances[ad.authToken] = {
			folders: {},
			processes: [],
			entities: {}
		};
		init(ad, orchestrator);
	}

	return orchestrator;
}

function authenticate(req, res) {
	Orchestrator2.authenticate(req.body.tenantName, req.body.clientId, req.body.userKey)
		.then((authToken) => {
			res.type('json').send({authToken: authToken});
		})
		.catch((err) => {
			res.type('json').status(401).send(err);
		});
};

function getJobStatus(req, res, cb) {
	var ad = getAuthDetails(req);
	refreshInstanceTime(ad);
	var orchestrator = getOrchestrator(ad);
	if (!orchestrator._credentials || !instances[orchestrator._credentials] || !instances[orchestrator._credentials].folders) {
		var msg = {error: 'please retry'};
		if (res)
			res.type('json').status(503).send(msg);
		else
			cb(msg);
		return;
	}

	ad.id = req.params.id.replace(/\D/, '');
	Orchestrator2.getJobDetails(orchestrator, ad)
		.then((response) => {
			if (res)
				res.type('json').send(response);
			else
				cb(response);
		})
		.catch((err) => {
			if (res)
				res.type('json').status(500).send({error: err});
			else
				cb({finished: true, error: err});
		});
}

function startProcess(ad, orchestrator, process, req, res) {
	var ia = {};
	for (p in req.body) {
		if (p != '_callBackURL') {
			ia[p] = req.body[p];
			// TODO: filter better
		}
	}

	Orchestrator2.startProcess(ad, orchestrator, instances[orchestrator._credentials].folders[process.folder], process, ia)
		.then((jID) => {
			var rReq = {
				params: {
					orgId: ad.orgId,
					tenantName: ad.tenantName
				},
				headers: {
					Authorization: "Bearer " + orchestrator._credentials
				}
			};
			if (req.body._callBackURL) {
				callBacks[jID] = {req: rReq, callBackURL: req.body._callBackURL};
				res.type('json').status(202).send({jobId: jID});
			} else {
				callBacks[jID] = {req:rReq, res: res};
			}
		})
		.catch((err) => {
		  	res.type('json').status(500).send({error: err});
		});
}

function loadFolders(ad, orchestrator, fIDs) {
	console.log(`Loading folders (${ad.orgId}/${ad.tenantName})`);
	return new Promise((resolve, reject) => {
		Orchestrator2.loadFolders(ad, orchestrator, fIDs)
			.then((data) => {
			    for (var i=0;i<data.Count;i++) {
			    	instances[ad.authToken].folders["/" + data.PageItems[i].FullyQualifiedName] = data.PageItems[i].Id;
			    }
			    resolve();
			})
			.catch((err) => {
				reject(err);
			});
	});
}

function loadProcesses(ad, orchestrator, f) {
	return new Promise((resolve, reject) => {
		Orchestrator2.loadProcesses(ad, orchestrator, instances[orchestrator._credentials].folders[f], f)
			.then((processes) => {
				for (var i=0;i<processes.length;i++)
			    	instances[ad.authToken].processes.push(processes[i]);
			    resolve(orchestrator);
			})
			.catch ((err) => {
		        console.error('Error: ' + err);
		        resolve(orchestrator);
			});
	});
}

function refreshFolders(req, res) {
	console.log("Refreshing folders");
	var ad = getAuthDetails(req);
	refreshInstanceTime(ad);
	delete instances[ad.authToken];
	getOrchestrator(ad);
	res.send({response: "Done"});
}

function loadEntities(ad) {
	console.log(`Loading entities (${ad.orgId}/${ad.tenantName})`);
	// adding entities
	for (var i=0;i<instances[ad.authToken].processes.length;i++) {
		var p = instances[ad.authToken].processes[i];
		switch(p.name) {
			case 'create':
			case 'read':
			case 'update':
			case 'delete':
			case 'list':
				if (!instances[ad.authToken].entities[p.folder])
					instances[ad.authToken].entities[p.folder] = {};
				instances[ad.authToken].entities[p.folder][p.name] = p;
				break;
		}
	}
	instances[ad.authToken].loaded = true;
}

function init(ad, orchestrator) {
	loadFolders(ad, orchestrator, {})
		.then(() => {
			console.log(`Loading processes (${ad.orgId}/${ad.tenantName})`);
			var pList = [];
			for (var f in instances[orchestrator._credentials].folders) {
				pList.push(loadProcesses(ad, orchestrator, f, loadEntities));
			}

			Promise.all(pList)
				.then(() => {
					loadEntities(ad)
				})
		})
		.catch((err) => {
			console.error(err);
		})
}

function renderFolder(ad, root, res) {
	root = root.replace(/^\//, '');
	root = root.replace(/\/$/, '');
	var out = {folders: [], processes: []};
	// subfolders
	for (var f in instances[ad.authToken].folders) {
		if (root == '' || f.indexOf(root) == 1) {
			var rest = f.substr(root.length+1);
			if (root == '' || rest[0] == '/') {
				if (rest.substring(1).indexOf("/") === -1) {
					out.folders.push(rest.substring(root == ''?0:1));
				}
			}
		}
	}
	// processes
	for (var i=0;i<instances[ad.authToken].processes.length;i++) {
		var p = instances[ad.authToken].processes[i];
		var f = p.folder;
		f = f.replace(/^\//, '');
		f = f.replace(/\/$/, '');
		if (f == root) {
			out.processes.push(p.name);
		}
	}

	if (out.folders.length > 0 || out.processes.length > 0 || instances[ad.authToken].folders['/' + root]) {
		res.type('json').send(out);
		return true;
	}
	return false;
}

function renderProcces(ad, process, res) {
	var pName = process.replace(/^.*\//, '');
	var fName = process.replace(/\/[^\/]*$/, '');
	for (var i=0;i<instances[ad.authToken].processes.length;i++) {
		var p = instances[ad.authToken].processes[i];
		if (p.folder == fName && p.name == pName) {
			var out = {};
			out.processName = p.name;
			out.arguments = {
				input: p.details.Arguments.Input,
				output: p.details.Arguments.Output
			}

			res.type('json').send(out);
			return true;
		}
	}
	return false;
}

function getFolders(req, res) {
	var ad = getAuthDetails(req);
	refreshInstanceTime(ad);
	var orchestrator = getOrchestrator(ad);
	if (!orchestrator._credentials || !instances[orchestrator._credentials] || !instances[orchestrator._credentials].folders) {
		res.type('json').status(503).send({error: 'please retry'});
		return;
	}

	var folder = '';
	if (req.params && req.params[0])
		folder = req.params[0];
	if (!renderFolder(ad, folder, res)) {
		res.status(404).send({error: "folder not found"});
	}
}

function getDeleteEntities(req, res) {
	var ad = getAuthDetails(req);
	refreshInstanceTime(ad);
	var orchestrator = getOrchestrator(ad);
	if (!orchestrator._credentials || !instances[orchestrator._credentials] || !instances[orchestrator._credentials].folders) {
		res.type('json').status(503).send({error: 'please retry'});
		return;
	}

	var folder = '';
	if (req.params && req.params[0])
		folder = req.params[0];
	folder = folder.replace(/\/+$/, '');
	if (req.method == "GET")
		for (e in instances[orchestrator._credentials].entities) {
			if (e == '/' + folder) {
				if (instances[orchestrator._credentials].entities[e].list) {
					// list
					var oReq = {
						params: req.params,
						body: {}
					};
					if (req.query._callBackURL)
						oReq.body._callBackURL = req.query._callBackURL;
					startProcess(ad, orchestrator, instances[ad.authToken].entities[e].list, oReq, res);
					return;
				}
				break;
			}
		}

	var id = folder.replace(/.*\//, '');
	folder = folder.replace(/\/[^\/]*$/, '');

	var oReq = {
		params: req.params,
		body: {
			id: id
		}
	};
	if (req.query._callBackURL)
		oReq.body._callBackURL = req.query._callBackURL;

	for (e in instances[ad.authToken].entities) {
		if (e == '/' + folder) {
			if (instances[ad.authToken].entities[e].read && req.method == "GET") {
				// read
				startProcess(ad, orchestrator, instances[ad.authToken].entities[e].read, oReq, res);
				return;
			}
			if (instances[ad.authToken].entities[e].delete && req.method == "DELETE") {
				// read
				startProcess(ad, orchestrator, instances[ad.authToken].entities[e].delete, oReq, res);
				return;
			}
			break;
		}
	}

	res.status(404).send({error: "entity not found"});
}

function postPatchEntities(req, res) {
	var ad = getAuthDetails(req);
	refreshInstanceTime(ad);
	var orchestrator = getOrchestrator(ad);
	if (!orchestrator._credentials || !instances[orchestrator._credentials] || !instances[orchestrator._credentials].folders) {
		res.type('json').status(503).send({error: 'please retry'});
		return;
	}

	var folder = '';
	if (req.params && req.params[0])
		folder = req.params[0];

	var id = folder.replace(/.*\//, '');
	folder = folder.replace(/\/[^\/]*$/, '');

	var oReq = req;
	if (id)
		oReq.body.id = id;

	if (req.query._callBackURL)
		oReq.body._callBackURL = req.query._callBackURL;

	for (e in instances[ad.authToken].entities) {
		if (e == '/' + folder) {
			if (instances[ad.authToken].entities[e].update && req.method == "PATCH") {
				// update
				startProcess(ad, orchestrator, instances[ad.authToken].entities[e].update, oReq, res);
				return;
			}
			if (instances[ad.authToken].entities[e].create && req.method == "POST") {
				// update
				startProcess(ad, orchestrator, instances[ad.authToken].entities[e].create, oReq, res);
				return;
			}
			break;
		}
	}

	res.status(404).send({error: "entity not found"});
}

function getProcess(req, res) {
	var ad = getAuthDetails(req);
	refreshInstanceTime(ad);
	var orchestrator = getOrchestrator(ad);
	if (!orchestrator._credentials || !instances[orchestrator._credentials] || !instances[orchestrator._credentials].folders) {
		res.type('json').status(503).send({error: 'please retry'});
		return;
	}

	var folder = '';
	if (req.params && req.params[0])
		folder = req.params[0];

	if (!renderProcces(ad, folder, res)) {
		res.status(404).send({error: "process not found"});
	}
}

function postProcess(req, res) {
	var ad = getAuthDetails(req);
	refreshInstanceTime(ad);
	var orchestrator = getOrchestrator(ad);
	if (!orchestrator._credentials || !instances[orchestrator._credentials] || !instances[orchestrator._credentials].folders) {
		res.type('json').status(503).send({error: 'please retry'});
		return;
	}
	var folder = '';
	if (req.params && req.params[0])
		folder = req.params[0];

	var pName = folder.replace(/^.*\//, '');
	var fName = '/' + folder.replace(/\/[^\/]*$/, '');

	for (var i=0;i<instances[ad.authToken].processes.length;i++) {
		var p = instances[ad.authToken].processes[i];
		if (p.folder == fName && p.name == pName) {
			startProcess(ad, orchestrator, p, req, res);
			return true;
		}
	}
	res.status(404).send({error: "process not found"});
	return false;
}

function getFoldersHtml(req, res) {
	res.sendFile(path.join(__dirname, 'public/folder.html'));
}

function getProcessHtml(req, res) {
	res.sendFile(path.join(__dirname, 'public/process.html'));
}

function processCallBacks() {
	for (jobId in callBacks) {
		callBacks[jobId].req.params.id = jobId;
		if (!callBacks[jobId].checking) {
			callBacks[jobId].checking = true;
			getJobStatus(callBacks[jobId].req, null, (response) => {
				if (response.finished === true || response.EndTime) {
					if (response.Result)
						response.Result = cleanUpEntities(response.Result);
					if (!callBacks[jobId].res) {

						// async
					} else {
						//sync
						var s = 200;
						if(response.State == 'Faulted') {
							s = 500;
						}

						callBacks[jobId].res.status(s).send(response.Result?response.Result:response);

					}
					delete callBacks[jobId];
				}
				else
					callBacks[jobId].checking = false;
			});
		}
	}
}
setInterval(processCallBacks, 1000);

function expireCache() {
	for (t in instances) {
		var instance = instances[t];
		if (instance.lastAccessed) {
			if(Date.now() - instance.lastAccessed > 1000*5*60)
				delete instances[t];
		}
	}
}
setInterval(expireCache, 1000*5*60);

var swagger = new Document({
    description: "Swagger deffinition",
    version: "1.0.0",
    title: "UiPath",
    paths: []
});

function swaggerCB(req, res, next) {
	var ad = getAuthDetails(req);
	refreshInstanceTime(ad);
	var orchestrator = getOrchestrator(ad);
	if (!orchestrator._credentials || !instances[orchestrator._credentials] || !instances[orchestrator._credentials].folders) {
		res.type('json').status(503).send({error: 'please retry'});
		return;
	}
	var paths = Swagger.getPaths(ad, instances[ad.authToken]);

	var doc = new Document({
	    description: "Swagger deffinition",
	    version: "1.0.0",
	    title: "UiPath",
	    paths: paths
	});

	swaggerUi.setup(doc);
	next();
}

function getStatus(req, res) {
	var ad = getAuthDetails(req);
	refreshInstanceTime(ad);
	if (instances[ad.authToken]) 
		if (instances[ad.authToken].loaded)
			res.send({status: "loaded"});
		else
			res.send({status: "please retry"});
	else {
		getOrchestrator(ad);
		res.status(404).send({error: "not found"});
	}
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(cookieParser());
app.get('/:orgId/:tenantName/docs', swaggerCB)
app.use('/:orgId/:tenantName/docs', swaggerUi.serve, swaggerUi.setup({swagger}));
app.get ('/:orgId/:tenantName/refresh', refreshFolders);
app.get ('/:orgId/:tenantName/folders*.html', getFoldersHtml);
app.get ('/:orgId/:tenantName/folders*', getFolders);
app.get ('/:orgId/:tenantName/processes*.html', getProcessHtml);
app.get ('/:orgId/:tenantName/processes*', getProcess);
app.post('/:orgId/:tenantName/processes/*', postProcess);
app.get('/:orgId/:tenantName/entities/*', getDeleteEntities);
app.delete('/:orgId/:tenantName/entities/*', getDeleteEntities);
app.post('/:orgId/:tenantName/entities/*', postPatchEntities);
app.patch('/:orgId/:tenantName/entities/*', postPatchEntities);
app.get('/:orgId/:tenantName/jobs/:id', getJobStatus);
app.get('/:orgId/:tenantName/status', getStatus)
app.post('/:orgId/:tenantName/auth', authenticate)

app.listen(port, () => {
  console.log(`Server listening on port ${port}`)
});