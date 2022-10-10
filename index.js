const util = require('util');
const {cleanUpEntities} = require('./functions.js');
const Orchestrator = require("./orchestrator-apis.js");
const cookieParser = require("cookie-parser");
const swaggerUi = require("swagger-ui-express");
const Swagger = require("./swagger.js");
const { Document, DType, Response, Operation, API } = require('swagger-generator-json')
const path = require("path");
const express = require('express');
const request = require('request');
const app = express();
const port = process.env.PORT?process.env.PORT:8080;

var instances = {};
var callBacks = {};
const presets = require("./presets.json");

function sendError(res, err) {
	console.error(err);
	var status = 500, msg = "Internal error";
	if (err.statusCode) {
		status = err.statusCode;
		msg = "";
	}
	res.status(status).send(msg);
}

function getAuthDetailsP(req) {
	return new Promise((resolve, reject) => {
		(async () => {
			try {
				var authToken;
				if (req.authToken)
					authToken = req.authToken;
				else if (req.cookies && req.cookies.authToken)
					authToken = req.cookies.authToken
				else if (req.headers && req.headers.authorization)
					authToken = req.headers.authorization.replace(/^Bearer\s+/, '');
				else {
					// check for cached auth token for preset endpoints
					var url = "/" + req.params.orgId + "/" + req.params.tenantName + "/processes";
					if (req.params[0][0] != '/')
						url += '/';
					url += req.params[0];

					if (presets.map[url])
						if (presets.authKeys[presets.map[url]].authToken)
							if (presets.authKeys[presets.map[url]].authToken == 'loading') {
								console.log("Waiting for authtoken");
								await until(_ => presets.authKeys[presets.map[url]].authToken != 'loading');
								authToken = presets.authKeys[presets.map[url]].authToken;
							}
							else
								authToken = presets.authKeys[presets.map[url]].authToken;
						else {
							presets.authKeys[presets.map[url]].authToken = 'loading';
							authToken = "";
						}
					else
						authToken = "";
				}
				if (!authToken) {
					authenticateP(req)
						.then((authToken) => {
							if (authToken && instances[authToken])
								instances[authToken].lastAccessed = Date.now();
							var ad = {
								authToken: authToken,
								orgId: req.params.orgId,
								tenantName: req.params.tenantName
							};

							getOrchestratorP(ad)
								.then((orchestrator) => {
									resolve([ad, orchestrator]);
								})
								.catch((err) => {
									reject(err);
								});
						})
						.catch((err) => {
							reject(err);
						})
					return;
				}

				if (instances[authToken] && !instances[authToken].loaded) {
					// waiting to load
					await until(_ => !instances[authToken] || instances[authToken].loaded);
				}

				if (instances[authToken])
					instances[authToken].lastAccessed = Date.now();

				var ad = {
					authToken: authToken,
					orgId: req.params.orgId,
					tenantName: req.params.tenantName
				};

				getOrchestratorP(ad)
					.then((orchestrator) => {
						resolve([ad, orchestrator]);
					})
					.catch((err) => {
						reject(err);
					});
			} catch(err) {
				reject(err);
			}
		})();
	});
}

function until(conditionFunction) {
  const poll = resolve => {
    if(conditionFunction()) resolve();
    else setTimeout(_ => poll(resolve), 1000);
  }

  return new Promise(poll);
}


function getOrchestratorP(ad) {
	return new Promise((resolve, reject) => {
		if (!ad.authToken) {
			reject();
			return;
		}
		var orchestrator = Orchestrator.getOrchestrator(ad.tenantName, ad.authToken);

		if (!instances[ad.authToken]) {
			instances[ad.authToken] = {
				folders: {},
				processes: [],
				queues: [],
				entities: {},
				for: ad.orgId + '/' + ad.tenantName,
				loaded: false
			};
			initP(ad, orchestrator)
				.then(() => {
					console.log("Load complete (" + ad.orgId + "/" + ad.tenantName + ")");
					resolve(orchestrator);
				})
				.catch((err) => {
					delete instances[ad.authToken];
					for (var authKey in presets.authKeys)
						if (presets.authKeys[authKey].authToken == ad.authToken)
							delete presets.authKeys[authKey].authToken;

					reject(err);
				});
			return;
		}

		resolve(orchestrator);
	});
}

function authenticateP(req) {
	return new Promise((resolve, reject) => {
		var url = "";
		if (!req.body.orgId) {
			url = "/" + req.params.orgId + "/" + req.params.tenantName + "/processes";
			if (req.params[0] && req.params[0][0] && req.params[0][0] != '/')
				url += '/';
			url += req.params[0];
			if (presets.map[url]) {
				req.body.orgId = req.params.orgId;
				req.body.tenantName = req.params.tenantName;
				req.body.clientId = presets.authKeys[presets.map[url]].clientId;
				req.body.userKey = presets.authKeys[presets.map[url]].userKey;
				req.body.environment = presets.authKeys[presets.map[url]].environment;
			}
		}
		Orchestrator.authenticateP(req.body.orgId, req.body.tenantName, req.body.clientId, req.body.userKey, req.body.environment)
			.then((authToken) => {
				// save auth token for further use
				if (url != '' && presets.map[url]) {
					presets.authKeys[presets.map[url]].authToken = authToken;
				}

				resolve(authToken);
			})
			.catch((err) => {
				reject(err);
			});
	});
};

function authenticate(req, res) {
	authenticateP(req)
		.then((authToken) => {
			res.type('json').send({authToken: authToken});
		})
		.catch((err) => {
			console.log(err);
			res.type('json').status(401).send(err);
		});
}

function getJobStatusP(req) {
	return new Promise((resolve, reject) => {
		getAuthDetailsP(req)
			.then((args) => {
				var ad = args[0];
				var orchestrator = args[1];
				ad.id = req.params.id.replace(/\D/g, '');
				Orchestrator.getJobDetailsP(orchestrator, ad)
					.then((response) => {
						resolve([ad.id, response]);
					})
					.catch((err) => {
						reject([ad.id, err]);
					});
			})
			.catch((err) => {
				reject([-1, err]);
			});
	});
}

function getJobStatus(req, res) {
	getJobStatusP(req)
		.then((args) => {
			var id = args[0];
			var response = args[1];
			res.type('json').send(response);
		})
		.catch((args) => {
			var id = args[0];
			var err = args[1];
			sendError(res, err);
		})
}

function getTransactionStatus(req, res) {
	getTransactionStatusP(req, res);
}

function getTransactionStatusP(req, res, fID) {
	return new Promise((resolve, reject) => {
		getAuthDetailsP(req)
			.then((args) => {
				var ad = args[0];
				var orchestrator = args[1];
				if (!fID) {
					var folder = '';
					if (req.params && req.params[0])
						folder = req.params[0];
					ad.id = folder.replace(/^.*\//, '');
					var fName = folder.replace(/\/[^\/]*$/, '');
					fID = instances[ad.authToken].folders["/" + fName];
				}

				if (!ad.id)
					ad.id = req.params.id.replace(/[\D]/g, '');

				Orchestrator.getTransactionStatusP(orchestrator, ad, fID)
					.then((response) => {
						var rsp = {
							"Status": response.Status,
							"Output": response.Output,
							"ProcessingExceptionType": response.ProcessingExceptionType,
							"ProcessingException": response.ProcessingException
						};
						if (res)
							res.type('json').send(rsp);
						resolve([ad.id, rsp]);
					})
					.catch((err) => {
						if (res)
							res.type('json').status(500).send({error: err});
						reject([ad.id, {error: err}]);
					});
			})
			.catch((err) => {
				reject(err);
			});
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

	Orchestrator.startProcessP(ad, orchestrator, instances[ad.authToken].folders[process.folder], process, ia)
		.then((jID) => {
			var rReq = {
				params: {
					orgId: ad.orgId,
					tenantName: ad.tenantName,
					id: "" + jID
				},
				type: "process",
				headers: {
					authorization: "Bearer " + ad.authToken
				}
			};
			callBacks[jID] = {req: rReq};

			if (req.body._callBackURL) {
				callBacks[jID].callBackURL = req.body._callBackURL;
				res.type('json').status(202).send({jobId: jID, pollingUrl: "http://" + req.headers.host + "/" + req.params.orgId + "/" + req.params.tenantName + "/jobs/" + jID});
			} else {
				callBacks[jID].res = res;
			}
		})
		.catch((err) => {
		  	res.type('json').status(500).send({error: err});
		});
}

function addQueueItem(ad, orchestrator, queue, req, res) {
	Orchestrator.addQueueItemP(ad, orchestrator, instances[ad.authToken].folders[queue.folder], queue, req.body)
		.then((transactionId) => {
			var rReq = {
				params: {
					orgId: ad.orgId,
					tenantName: ad.tenantName,
					id: "" + transactionId
				},
				type: "queue",
				headers: {
					authorization: "Bearer " + ad.authToken
				}
			};
			callBacks[transactionId] = {req: rReq};
			callBacks[transactionId].fID = instances[ad.authToken].folders[queue.folder];

			if (req.body._callBackURL) {
				callBacks[transactionId].callBackURL = req.body._callBackURL;
				res.type('json').status(202).send({transactionId: transactionId, pollingUrl: "http://" + req.headers.host + "/" + req.params.orgId + "/" + req.params.tenantName + "/transactions" + queue.folder + "/" + transactionId});
			} else {
				callBacks[transactionId].res = res;
			}
		})
		.catch((err) => {
		  	res.type('json').status(500).send({error: err});
		});
}

function loadFoldersP(ad, orchestrator, fIDs) {
	return new Promise((resolve, reject) => {
		console.log(`Loading folders (${ad.orgId}/${ad.tenantName})`);
		Orchestrator.loadFoldersP(ad, orchestrator, fIDs)
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

function loadProcessesP(ad, orchestrator, f) {
	return new Promise((resolve, reject) => {
		Orchestrator.loadProcessesP(ad, orchestrator, instances[ad.authToken].folders[f], f)
			.then((processes) => {
				for (var i=0;i<processes.length;i++) {
			    	instances[ad.authToken].processes.push(processes[i]);
				}
			    resolve(orchestrator);
			})
			.catch((err) => {
		        console.error('Error: ' + err);
		        resolve(orchestrator);
			});
	});
}

function loadQueuesP(ad, orchestrator, f) {
	return new Promise((resolve, reject) => {
		Orchestrator.loadQueuesP(ad, orchestrator, instances[ad.authToken].folders[f], f)
			.then((queues) => {
				for (var i=0;i<queues.length;i++) {
			    	instances[ad.authToken].queues.push(queues[i]);
			    	Orchestrator.loadQueueDetailsP(ad, orchestrator, instances[ad.authToken].folders[f], f, queues[i].id)
			    		.then((queue) => {
			    			for (var i=0;i<instances[ad.authToken].queues.length;i++) {
			    				if (instances[ad.authToken].queues[i].id == queue.id) {
			    					instances[ad.authToken].queues[i].inSchema = queue.inSchema;
			    					instances[ad.authToken].queues[i].outSchema = queue.outSchema;
			    					break;
			    				}
			    			}
			    		})
			    		.catch((err) => {
					        console.error('Error: ' + err);
			    		});
				}
			    resolve(orchestrator);
			})
			.catch((err) => {
		        console.error('Error: ' + err);
		        resolve(orchestrator);
			});
	});
}

function refreshFolders(req, res) {
	console.log("Refreshing folders");
	getAuthDetailsP(req)
		.then((args) => {
			var ad = args[0];
			var orchestrator = args[1];
			delete instances[ad.authToken];
			for (var authKey in presets.authKeys)
				if (presets.authKeys[authKey].authToken == ad.authToken)
					delete presets.authKeys[authKey].authToken;

			getOrchestratorP(ad);
			res.send({response: "Done"});
		})
		.catch((err) => {
			sendError(res, err);
		});
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

function initP(ad, orchestrator) {
	return new Promise((resolve, reject) => {
		loadFoldersP(ad, orchestrator, {})
			.then(() => {
				console.log(`Loading processes (${ad.orgId}/${ad.tenantName})`);
				var pList = [];
				for (var f in instances[ad.authToken].folders) {
					pList.push(loadProcessesP(ad, orchestrator, f));
					pList.push(loadQueuesP(ad, orchestrator, f));
				}

				Promise.all(pList)
					.then(() => {
						loadEntities(ad);
						resolve();
					});

			})
			.catch((err) => {
				console.log(err);
				reject(err);
			})
	});
}

function renderFolder(ad, root, res) {
	root = root.replace(/^\//, '');
	root = root.replace(/\/$/, '');
	var out = {folders: [], processes: [], queues: []};
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
	// queues
	for (var i=0;i<instances[ad.authToken].queues.length;i++) {
		var q = instances[ad.authToken].queues[i];
		var f = q.folder;
		f = f.replace(/^\//, '');
		f = f.replace(/\/$/, '');
		if (f == root) {
			out.queues.push(q.name);
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

function renderQueue(ad, process, res) {
	var qName = process.replace(/^.*\//, '');
	var fName = process.replace(/\/[^\/]*$/, '');
	for (var i=0;i<instances[ad.authToken].queues.length;i++) {
		var q = instances[ad.authToken].queues[i];
		if (q.folder == fName && q.name == qName) {
			var out = {};
			out.id = q.id;
			out.queueName = q.name;
			out.inSchema = q.inSchema;
			out.outSchema = q.outSchema;

			res.type('json').send(out);
			return true;
		}
	}
	return false;
}

function getFolders(req, res) {
	getAuthDetailsP(req)
		.then((args) => {
			var ad = args[0];
			var orchestrator = args[1];
			var folder = '';
			if (req.params && req.params[0])
				folder = req.params[0];
			if (!renderFolder(ad, folder, res)) {
				res.status(404).send({error: "folder not found"});
			}
		})
		.catch((err) => {
			sendError(res, err);
		});
}

function getDeleteEntities(req, res) {
	getAuthDetailsP(req)
		.then((args) => {
			var ad = args[0];
			var orchestrator = args[1];
			var folder = '';
			if (req.params && req.params[0])
				folder = req.params[0];
			folder = folder.replace(/\/+$/, '');
			if (req.method == "GET")
				for (e in instances[ad.authToken].entities) {
					if (e == '/' + folder) {
						if (instances[ad.authToken].entities[e].list) {
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
		})
		.catch((err) => {
			sendError(res, err);
		});
}

function postPatchEntities(req, res) {
	getAuthDetailsP(req)
		.then((args) => {
			var ad = args[0];
			var orchestrator = args[1];
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
		})
		.catch((err) => {
			sendError(res, err);
		});
}

function getProcess(req, res) {
	getAuthDetailsP(req)
		.then((args) => {
			var ad = args[0];
			var orchestrator = args[1];
			var folder = '';
			if (req.params && req.params[0])
				folder = req.params[0];

			if (!renderProcces(ad, folder, res)) {
				res.status(404).send({error: "process not found"});
			}	
		})
		.catch((err) => {
			sendError(res, err);
		});
}

function postProcess(req, res) {
	getAuthDetailsP(req)
		.then((args) => {
			var ad = args[0];
			var orchestrator = args[1];
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
		})
		.catch((err) => {
			console.log(err);
			sendError(res, err);
		});
}

function getQueue(req, res) {
	getAuthDetailsP(req)
		.then((args) => {
			var ad = args[0];
			var orchestrator = args[1];
			var folder = '';
			if (req.params && req.params[0])
				folder = req.params[0];

			if (!renderQueue(ad, folder, res)) {
				res.status(404).send({error: "queue not found"});
			}
		})
		.catch((err) => {
			sendError(res, err);
		});
}

function postQueue(req, res) {
	getAuthDetailsP(req)
		.then((args) => {
			var ad = args[0];
			var orchestrator = args[1];
			var folder = '';
			if (req.params && req.params[0])
				folder = req.params[0];

			var qName = folder.replace(/^.*\//, '');
			var fName = '/' + folder.replace(/\/[^\/]*$/, '');

			for (var i=0;i<instances[ad.authToken].queues.length;i++) {
				var q = instances[ad.authToken].queues[i];
				if (q.folder == fName && q.name == qName) {
					addQueueItem(ad, orchestrator, q, req, res);
					return;
				}
			}
			res.status(404).send({error: "process not found"});
		})
		.catch((err) => {
			sendError(res, err);
		});
}

function getFoldersHtml(req, res) {
	res.sendFile(path.join(__dirname, 'public/folder.html'));
}

function getProcessHtml(req, res) {
	res.sendFile(path.join(__dirname, 'public/process.html'));
}

function getQueueHtml(req, res) {
	res.sendFile(path.join(__dirname, 'public/queue.html'));
}


function processJobCallback(id, response) {
	if (response.EndTime) {
		if (response.Result)
			response.Result = cleanUpEntities(response.Result);
		else 
			if (response.OutputArguments)
				response.Result = response.OutputArguments;

		if(response.State == 'Faulted') {
			delete response.Result;
		}
		if (!callBacks[id].res) {
			// async
			request.post(callBacks[id].callBackURL, {json: response.Result?response.Result:response}, (err, res, data) => {
				if (err) console.error("Error callback'ing: " + err);
			});
		} else {
			//sync
			callBacks[id].res.status(200).send(response.Result?response.Result:response);
		}
		delete callBacks[id];
	}
	else
		callBacks[id].checking = false;
}

function processQueueItemCallback(id, response) {
	if(response.Status == "New" || response.Status == "InProgress") {
		callBacks[id].checking = false;
		return;
	}
	if (!callBacks[id].res) {
		// async
		request.post(callBacks[id].callBackURL, {json: response}, (err, res, data) => {
				if (err) console.error("Error callback'ing: " + err);
			});
	} else {
		//sync
		callBacks[id].res.status(200).send(response);
	}
	delete callBacks[id];
}

function processJobsWebhook(req, res) {
	if (req.body.Jobs)
		for (var job in req.body.Jobs) {
			console.log("Received job callback for " + job.Id);
			if (callBacks[job.Id] && !callBacks[job.Id].checking) {
				callBacks[job.Id].checking = true;
				processJobCallback(job.Id, job);
			}
		}
	if (req.body.Job) {
		console.log("Received job callback for " + req.body.Job.Id);
		if (callBacks[req.body.Job.Id] && !callBacks[req.body.Job.Id].checking) {
			callBacks[req.body.Job.Id].checking = true;
			processJobCallback(req.body.Job.Id, req.body.Job);
		}
	}
	res.send('{status: "done"}');
}

function processQueueItensWebhook(req, res) {
	if (req.body.QueueItems)
		for (var qi in req.body.QueueItems) {
			console.log("Received queue item callback for " + qi.Id);
			if (callBacks[qi.Id] && !callBacks[qi.Id].checking) {
				callBacks[qi.Id].checking = true;
				processQueueItemCallback(qi.Id, qi);
			}
		}
	if (req.body.QueueItem) {
		console.log("Received queue item callback for " + req.body.QueueItem.Id);
		if (callBacks[req.body.QueueItem.Id] && !callBacks[req.body.QueueItem.Id].checking) {
			callBacks[req.body.QueueItem.Id].checking = true;
			processQueueItemCallback(req.body.QueueItem.Id, req.body.QueueItem);
		}
	}
	res.send('{status: "done"}');
}

function processCallBacks() {
	for (var id in callBacks) {
		if (!callBacks[id].checking) {
			callBacks[id].checking = true;
			if (callBacks[id].req.type == "process")
				getJobStatusP(callBacks[id].req)
					.then((args) => {
						var id = args[0];
						var response = args[1];
						processJobCallback(id, response);
					})
					.catch((args) => {
						var id = args[0];
						var err = args[1];
						if (!callBacks[id].res) {
							// async
							request.post(callBacks[id].callBackURL, {json: response.Result?response.Result:response}, (err, res, data) => {
								if (err) console.error("Error callback'ing: " + err);
							});
						} else {
							//sync
							callBacks[id].res.status(500).send(response.Result?response.Result:response);
						}
						delete callBacks[id];
					});
			else {
				getTransactionStatusP(callBacks[id].req, null, callBacks[id].fID)
					.then((args) => {
						var id = args[0];
						var response = args[1];
						processQueueItemCallback(id, response);
					})
					.catch((args) => {
						var id = args[0];
						var response = args[1];
						if (!callBacks[id].res) {
							// async
							request.post(callBacks[id].callBackURL, {json: response}, (err, res, data) => {
									if (err) console.error("Error callback'ing: " + err);
								});
						} else {
							//sync
							callBacks[id].res.status(500).send(response);
						}
						delete callBacks[id];
					});
			}
		}
	}
}

function expireCache() {
	for (var authToken in instances) {
		var instance = instances[authToken];
		if (instance.lastAccessed) {
			// delete cache after 1 hour of inactivity
			if(Date.now() - instance.lastAccessed > 1000*60*60) {
				// after 1 hour of inactivity
				console.log("Expiring cache for " + instance.for);
				delete instances[authToken];
				for (var authKey in presets.authKeys)
					if (presets.authKeys[authKey].authToken == authToken)
						delete presets.authKeys[authKey].authToken;
			}
		}
	}
}

var swagger = new Document({
    description: "Swagger deffinition",
    version: "1.0.0",
    title: "UiPath",
    paths: []
});

function swaggerCB(req, res, next) {
	getAuthDetailsP(req)
		.then((args) => {
			var ad = args[0];
			var orchestrator = args[1];
			var paths = Swagger.getPaths(ad, instances[ad.authToken]);
			var doc = new Document({
			    description: "Swagger deffinition",
			    version: "1.0.0",
			    title: "UiPath",
			    paths: paths
			});

			swaggerUi.setup(doc);
			next();
		})
		.catch((err) => {
			sendError(res, err);
		});
}

function getStatus(req, res) {
	getAuthDetailsP(req)
		.then((args) => {
			var ad = args[0];
			var orchestrator = args[1];
			if (instances[ad.authToken]) 
				if (instances[ad.authToken].loaded)
					res.send({status: "loaded"});
				else
					res.send({status: "please retry"});
			else {
				getOrchestratorP(ad);
				res.status(404).send({error: "not found"});
			}
		})
		.catch((err) => {
			sendError(res, err);
		});
}

function setup(req, res) {
	getAuthDetailsP(req)
		.then((args) => {
			var ad = args[0];
			var orchestrator = args[1];
			if (instances[ad.authToken]) {
				// setup webhooks
				var websiteUrl = req.protocol + '://' + req.get('host');

				Orchestrator.getWebHooksP(orchestrator, ad, websiteUrl)
				.then((whList) => {
					if (whList.value.length == 0) {
						// add webhooks
						Orchestrator.addWebHookP(orchestrator, ad, websiteUrl + '/webhooks/jobs', [{"EventType":"job.completed"},{"EventType":"job.faulted"},{"EventType":"job.stopped"}])
						.then(() => {
							Orchestrator.addWebHookP(orchestrator, ad, websiteUrl + '/webhooks/queueItems', [{"EventType":"queueItem.transactionCompleted"},{"EventType":"queueItem.transactionFailed"},{"EventType":"queueItem.transactionAbandoned"},{"EventType":"queueItem.transactionStarted"}])
							.then(() => {
								res.status(404).send({status: "DONE"});
							})
							.catch((err) => {
								res.status(500).send({error: err});
							});
						})
						.catch((err) => {
							res.status(500).send({error: err});
						});

					}
				})
				.catch((err) => {
					res.status(500).send({error: err});
				});
			}
			else {
				getOrchestratorP(ad);
				res.status(404).send({error: "not found"});
			}
		})
		.catch((err) => {
			sendError(res, err);
		});
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());

app.get('/:orgId/:tenantName/docs', swaggerCB)
app.use('/:orgId/:tenantName/docs', swaggerUi.serve, swaggerUi.setup({swagger}));
app.get ('/:orgId/:tenantName/refresh', refreshFolders);
app.get ('/:orgId/:tenantName/folders*.html', getFoldersHtml);
app.get ('/:orgId/:tenantName/folders*', getFolders);
app.get ('/:orgId/:tenantName/processes*.html', getProcessHtml);
app.get ('/:orgId/:tenantName/processes*', getProcess);
app.post('/:orgId/:tenantName/processes/*', postProcess);
app.get ('/:orgId/:tenantName/queues*.html', getQueueHtml);
app.get ('/:orgId/:tenantName/queues*', getQueue);
app.post('/:orgId/:tenantName/queues/*', postQueue);
app.get('/:orgId/:tenantName/entities/*', getDeleteEntities);
app.delete('/:orgId/:tenantName/entities/*', getDeleteEntities);
app.post('/:orgId/:tenantName/entities/*', postPatchEntities);
app.patch('/:orgId/:tenantName/entities/*', postPatchEntities);
app.get('/:orgId/:tenantName/jobs/:id', getJobStatus);
app.get('/:orgId/:tenantName/transactions/*', getTransactionStatus);
app.get('/:orgId/:tenantName/status', getStatus);
app.get('/:orgId/:tenantName/setup', setup);
app.post('/:orgId/:tenantName/auth', authenticate);
app.post('/webhooks/jobs', processJobsWebhook);
app.post('/webhooks/jobs', processQueueItensWebhook);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`)
});

setInterval(processCallBacks, 10000); // check every 10 seconds
setInterval(expireCache, 1000*5*60); // check every 5 minutes
