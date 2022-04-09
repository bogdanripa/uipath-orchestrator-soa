const util = require('util');
const Orchestrator = require('uipath-orchestrator');
const Orchestrator2 = require("./orchestrator-apis.js");
const cookieParser = require("cookie-parser");
const swaggerUi = require("swagger-ui-express");
const { Document, DType, Response, Operation, API } = require('swagger-generator-json')
const path = require("path");
const express = require('express');
const app = express();
const port = 3000;

var instances = {};
var callBacks = [];

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
	var orchestrator = getOrchestrator(req);
	if (!orchestrator._credentials || !instances[orchestrator._credentials] || !instances[orchestrator._credentials].folders) {
		var msg = {error: 'Please retry'};
		if (res)
			res.type('json').status(503).send(msg);
		else
			cb(msg);
		return;
	}
	var jID = req.params.id.replace(/\D/, '');
	var url = '/' + req.params.orgId + '/' + req.params.tenantName + '/orchestrator_/odata/Jobs('+jID+')';

	orchestrator.get(url, {}, function (err, data) {
		if (err) {
			console.error('Error: ' + err);
			var msg = {finished: true, error: err};
			if (res)
				res.type('json').status(500).send(msg);
			else
				cb(msg);
			return;
		}
		var msg = {
			StartTime: data.StartTime,
			EndTime: data.EndTime,
			State: data.State,
			Info: data.Info,
			CreationTime: data.CreationTime,
			Result: JSON.parse(data.OutputArguments)
		};
		if (res)
			res.type('json').send(msg);
		else
			cb(msg);
	});
}

function startProcess(orchestrator, process, req, res) {
	var apiQuery = {
		"startInfo": {
		    "ReleaseKey": process.details.Key,
		    "JobsCount": 1,
		    "JobPriority": "Normal",
		  //"RobotIds": []
		    "Strategy": "ModernJobsCount", // JobsCount
		  }
	};

	var ia = {};
	for (p in req.body) {
		if (p != '_callBackURL') {
			ia[p] = req.body[p];
			// TODO: filter better
		}
	}

	apiQuery.startInfo.InputArguments = JSON.stringify(ia);

	var url = '/' + req.params.orgId + '/' + req.params.tenantName + '/orchestrator_/odata/Jobs/UiPath.Server.Configuration.OData.StartJobs';
	orchestrator.switchOrganizationUnitId(instances[orchestrator._credentials].folders[process.folder]);
	orchestrator.post(url, apiQuery, function (err, data) {
	  if (err) {
	  	//console.log(url);
	  	//console.log(instances[orchestrator._credentials].folders[process.folder]);
	  	//console.log(apiQuery);
	    console.error('Error: ' + err);
	  	res.type('json').status(500).send({error: err});
	    return;
	  }
	  console.log("Job start requested.");
	  var rReq = {
  		params: {
  			orgId: req.params.orgId,
  			tenantName: req.params.tenantName
	  	},
	  	headers: {
	  		Authorization: "Bearer " + orchestrator._credentials
	  	}
	  };
	  if (req.body._callBackURL) {
		  callBacks[data.value[0].Id] = {req: rReq, callBackURL: req.body._callBackURL};
		  res.type('json').status(202).send({jobId: data.value[0].Id});
		  return;
	  } else {
		  callBacks[data.value[0].Id] = {req:rReq, res: res};
	  }
	});
}

function loadFolders(orchestrator, orgId, tenantName, fIDs, cb) {
	var apiQuery = {};
	var url = '/' + orgId + '/' + tenantName + '/orchestrator_/api/FoldersNavigation/GetFoldersPageForCurrentUser?skip=0';
	for (var key in fIDs)
		url += '&expandedParentIds=' + key;

	orchestrator.get(url, apiQuery, function (err, data) {
	    if (err) {
	        console.error('Error: ' + err);
	        return;
	    }
	    var added = false;
	    for (var i=0;i<data.Count;i++) {
	    	if (data.PageItems[i].HasChildren && !fIDs[data.PageItems[i].Id]) {
	    		fIDs[data.PageItems[i].Id] = 1;
	    		added = true;
	    	}
	    }
	    if (added) {
	    	loadFolders(orchestrator, orgId, tenantName, fIDs, cb);
	    } else {
    		instances[orchestrator._credentials] = {
				folders: {},
				processes: [],
				entities: {}
			};

		    for (var i=0;i<data.Count;i++) {
		    	instances[orchestrator._credentials].folders["/" + data.PageItems[i].FullyQualifiedName] = data.PageItems[i].Id;
		    }
		    cb(orchestrator);
	    }
	});
}

function loadProcesses(orchestrator, orgId, tenantName, f, cb) {
	var apiQuery = {};
	var url = '/' + orgId + '/' + tenantName + '/orchestrator_/odata/Releases?$select=Id,IsLatestVersion,IsProcessDeleted,ProcessKey,ProcessVersion,Description,Arguments,Name,JobPriority,FeedId,RequiresUserInteraction,ProcessType,EntryPoint,IsCompiled,TargetFramework,IsAttended,Tags,Key&$top=100&$expand=Environment,CurrentVersion,EntryPoint&$orderby=Name%20asc';
	orchestrator.switchOrganizationUnitId(instances[orchestrator._credentials].folders[f]);
	orchestrator.get(url, apiQuery, function (err, data) {
	    if (err) {
	        console.error('Error: ' + err);
	        cb(orchestrator);
	        return;
	    }
	    for (var i=0;i<data.value.length;i++) {
	    	if (data.value[i].Arguments.Input){
		    	data.value[i].Arguments.Input = JSON.parse(data.value[i].Arguments.Input.replace(/\\n, ''/));
		    	for (var j=0;j<data.value[i].Arguments.Input.length;j++) {
		    		data.value[i].Arguments.Input[j].type = data.value[i].Arguments.Input[j].type.replace(/,.*/, '');
		    		data.value[i].Arguments.Input[j].type = data.value[i].Arguments.Input[j].type.replace(/^System./, '');
		    	}
	    	}
	    	if (data.value[i].Arguments.Output){
		    	data.value[i].Arguments.Output = JSON.parse(data.value[i].Arguments.Output.replace(/\\n, ''/));
		    	for (var j=0;j<data.value[i].Arguments.Output.length;j++) {
		    		data.value[i].Arguments.Output[j].type = data.value[i].Arguments.Output[j].type.replace(/,.*/, '');
		    		data.value[i].Arguments.Output[j].type = data.value[i].Arguments.Output[j].type.replace(/^System./, '');
		    	}
	    	}

	    	instances[orchestrator._credentials].processes.push({
	    		folder: f,
	    		name: data.value[i].Name.replace(/[^\d\w_\-]/g, ''),
	    		details: data.value[i]
	    	});
	    }
	    cb(orchestrator);
	});	
}

function refreshFolders(req, res) {
	var authToken = req.cookies.authToken || req.headers.Authorization.replace(/^Bearer\s+/, '');
	delete instances[authToken];
	getOrchestrator(req);
	res.send({response: "Done"});
}

function getOrchestrator(req) {
	var authToken;
	if (req.cookies && req.cookies.authToken)
		authToken = req.cookies.authToken
	else
		authToken = req.headers.Authorization.replace(/^Bearer\s+/, '');

	var orchestrator = new Orchestrator({
		tenancyName: req.params.tenantName,
		accessToken: authToken
	});
	orchestrator._getAccessToken();

	if (!instances[authToken])
		init(orchestrator, req.params.orgId, req.params.tenantName);

	return orchestrator;
}

var _pCnt = 0;
function pLoaded(orchestrator) {
	_pCnt++;
	console.log("Loading " + _pCnt + " of " + Object.keys(instances[orchestrator._credentials].folders).length);
	if (_pCnt != Object.keys(instances[orchestrator._credentials].folders).length)
		return;

	// adding entities
	for (var i=0;i<instances[orchestrator._credentials].processes.length;i++) {
		var p = instances[orchestrator._credentials].processes[i];
		switch(p.name) {
			case 'create':
			case 'read':
			case 'update':
			case 'delete':
			case 'list':
				if (!instances[orchestrator._credentials].entities[p.folder])
					instances[orchestrator._credentials].entities[p.folder] = {};
				instances[orchestrator._credentials].entities[p.folder][p.name] = p;
				break;
		}
	}
}

function init(orchestrator, orgId, tenantName) {
	loadFolders(orchestrator, orgId, tenantName, {}, (orchestrator) => {
		for (var f in instances[orchestrator._credentials].folders) {
			loadProcesses(orchestrator, orgId, tenantName, f, pLoaded);
		}
	});
}

function renderFolder(orchestrator, root, res) {
	root = root.replace(/^\//, '');
	root = root.replace(/\/$/, '');
	var out = {folders: [], processes: []};
	// subfolders
	for (var f in instances[orchestrator._credentials].folders) {
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
	for (var i=0;i<instances[orchestrator._credentials].processes.length;i++) {
		var p = instances[orchestrator._credentials].processes[i];
		var f = p.folder;
		f = f.replace(/^\//, '');
		f = f.replace(/\/$/, '');
		if (f == root) {
			out.processes.push(p.name);
		}
	}

	if (out.folders.length > 0 || out.processes.length > 0 || instances[orchestrator._credentials].folders['/' + root]) {
		res.type('json').send(out);
		return true;
	}
	return false;
}

function renderProcces(orchestrator, process, res) {
	var pName = process.replace(/^.*\//, '');
	var fName = process.replace(/\/[^\/]*$/, '');
	for (var i=0;i<instances[orchestrator._credentials].processes.length;i++) {
		var p = instances[orchestrator._credentials].processes[i];
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
	var orchestrator = getOrchestrator(req);
	if (!orchestrator._credentials || !instances[orchestrator._credentials] || !instances[orchestrator._credentials].folders) {
		res.type('json').status(503).send({error: 'Please retry'});
		return;
	}

	var folder = '';
	if (req.params && req.params[0])
		folder = req.params[0];
	if (!renderFolder(orchestrator, folder, res)) {
		res.status(404).send({error: "Folder not found"});
	}
}

function getDeleteEntities(req, res) {
	var orchestrator = getOrchestrator(req);
	if (!orchestrator._credentials || !instances[orchestrator._credentials] || !instances[orchestrator._credentials].folders) {
		res.type('json').status(503).send({error: 'Please retry'});
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
					startProcess(orchestrator, instances[orchestrator._credentials].entities[e].list, oReq, res);
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

	for (e in instances[orchestrator._credentials].entities) {
		if (e == '/' + folder) {
			if (instances[orchestrator._credentials].entities[e].read && req.method == "GET") {
				// read
				startProcess(orchestrator, instances[orchestrator._credentials].entities[e].read, oReq, res);
				return;
			}
			if (instances[orchestrator._credentials].entities[e].delete && req.method == "DELETE") {
				// read
				startProcess(orchestrator, instances[orchestrator._credentials].entities[e].delete, oReq, res);
				return;
			}
			break;
		}
	}

	res.status(404).send({error: "Entity not found"});
}

function postPatchEntities(req, res) {
	var orchestrator = getOrchestrator(req);
	if (!orchestrator._credentials || !instances[orchestrator._credentials] || !instances[orchestrator._credentials].folders) {
		res.type('json').status(503).send({error: 'Please retry'});
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

	for (e in instances[orchestrator._credentials].entities) {
		if (e == '/' + folder) {
			if (instances[orchestrator._credentials].entities[e].update && req.method == "PATCH") {
				// update
				startProcess(orchestrator, instances[orchestrator._credentials].entities[e].update, oReq, res);
				return;
			}
			if (instances[orchestrator._credentials].entities[e].create && req.method == "POST") {
				// update
				startProcess(orchestrator, instances[orchestrator._credentials].entities[e].create, oReq, res);
				return;
			}
			break;
		}
	}

	res.status(404).send({error: "Entity not found"});
}

function getProces(req, res) {
	var orchestrator = getOrchestrator(req);
	if (!orchestrator._credentials || !instances[orchestrator._credentials] || !instances[orchestrator._credentials].folders) {
		res.type('json').status(503).send({error: 'Please retry'});
		return;
	}

	var folder = '';
	if (req.params && req.params[0])
		folder = req.params[0];

	if (!renderProcces(orchestrator, folder, res)) {
		res.status(404).send({error: "Process not found"});
	}
}

function postProcess(req, res) {
	var orchestrator = getOrchestrator(req);
	if (!orchestrator._credentials || !instances[orchestrator._credentials] || !instances[orchestrator._credentials].folders) {
		res.type('json').status(503).send({error: 'Please retry'});
		return;
	}
	var folder = '';
	if (req.params && req.params[0])
		folder = req.params[0];

	var pName = folder.replace(/^.*\//, '');
	var fName = '/' + folder.replace(/\/[^\/]*$/, '');

	for (var i=0;i<instances[orchestrator._credentials].processes.length;i++) {
		var p = instances[orchestrator._credentials].processes[i];
		if (p.folder == fName && p.name == pName) {
			startProcess(orchestrator, p, req, res);
			return true;
		}
	}
	res.status(404).send({error: "Process not found"});
	return false;
}

function getFoldersHtml(req, res) {
	res.sendFile(path.join(__dirname, 'public/folder.html'));
}

function getProcesHtml(req, res) {
	res.sendFile(path.join(__dirname, 'public/process.html'));
}

function processCallBacks() {
	for (jobId in callBacks) {
		callBacks[jobId].req.params.id = jobId;
		if (!callBacks[jobId].checking) {
			callBacks[jobId].checking = true;
			getJobStatus(callBacks[jobId].req, null, (response) => {
				if (response.finished === true || response.EndTime) {
					if (!callBacks[jobId].res) {

						// async
					} else {
						//sync
						callBacks[jobId].res.send(response);
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

var swagger = new Document({
    description: "Swagger deffinition",
    version: "1.0.0",
    title: "UiPath",
    paths: []
});

function swaggerCB(req, res, next) {
	var orchestrator = getOrchestrator(req);
	if (!orchestrator._credentials || !instances[orchestrator._credentials] || !instances[orchestrator._credentials].folders) {
		res.type('json').status(503).send({error: 'Please retry'});
		return;
	}
	var paths = [];
	var fs = {};
	Object.assign(fs, {'/':0}, instances[orchestrator._credentials].folders);

	for (f in fs) {
		paths.push(new API({
		    path: '/' + req.params.orgId + '/' + req.params.tenantName  + '/folders'+ f,
		    operation: [
		        new Operation({
		        	summary: "Gets the list of subfolders and processes in " + f,
		            method: DType.get,
		            parameters: [],
		            responses: [
		                new Response({
		                	code: 503,
		                	description: "Folder structure is loading, please retry the call",
		                	schema: {error: DType.string}
		                }),
		                new Response({
		                    schema: {
		                    	folders: [
		                    		DType.string
		                    	],
		                    	processes: [
		                    		DType.string
		                    	]
		                    }
		                })
		            ],
				    tags: 'Folder operations'
		        })
		    ]
		}));
	}

	for (var i=0;i<instances[orchestrator._credentials].processes.length;i++) {
		var p = instances[orchestrator._credentials].processes[i];
		var iParams = [];
		var iOptionalParams = [];
		var oParams = {};
		if (p.details.Arguments && p.details.Arguments.Input) {
			var args = p.details.Arguments.Input;
			for (var j=0;j<args.length;j++) {
				var pp = args[j];
				pp.type = pp.type.replace(/(int|double)\d*/i, 'number');
				iParams.push({
					name: pp.name,
					type: pp.type.toLowerCase(),
					place: DType.formData,
					description: ""
				});
			}
			iParams.push({
				name: "_callBackURL",
				type: DType.string,
				place: DType.formData,
				description: "Leave empty for sync calls",
				required: false
			});
		}
		if (p.details.Arguments && p.details.Arguments.Output) {
			var args = p.details.Arguments.Output;
			for (var j=0;j<args.length;j++) {
				var pp = args[j];
				pp.type = pp.type.replace(/(int|double)\d*/i, 'number');
				oParams[pp.name] = pp.type.toLowerCase();
			}
		}
		paths.push(new API({
		    path: '/' + req.params.orgId + '/' + req.params.tenantName  + '/processes'+ p.folder + '/' + p.name,
		    operation: [
		        new Operation({
		        	summary: "Starts the " + p.name + " process",
		            method: DType.post,
				    tags: 'Process operations',
		            parameters: iParams,
		            //optionParams: iOptionalParams,
		            responses: [
		                new Response({
		                	code: 503,
							description: "Folder structure is loading, please retry the call",
		                	schema: {error: DType.string}
		                }),
		                new Response({
		                	code: 202,
		                	description: "Used for async calls",
		                    schema: {jobId: DType.number}
		                }),
		                new Response({
		                	code: 200,
		                	description: "Used for sync calls",
		                    schema: {
		                    	StartTime: DType.string,
		                    	EndTime: DType.string,
		                    	State: DType.string,
		                    	Info: DType.string,
		                    	CreationTime: DType.string,
		                    	Result: oParams
		                    }
		                })
		            ]
		        }),
		        new Operation({
		        	summary: "Gets " + p.name + " process details",
		            method: DType.get,
				    tags: 'Process operations',
		            parameters: [],
		            responses: [
		                new Response({
		                	code: 503,
		                	description: "Folder structure is loading, please retry the call",
		                	schema: {error: DType.string}
		                }),
		                new Response({
		                    schema: {
		                    	processName: DType.string,
		                    	arguments: {
		                    		input:[
			                    		{
			                    			name: DType.string,
			                    			type: DType.string,
			                    			required: DType.boolean,
			                    			hasDefault: DType.boolean
			                    		}
		                    		],
		                    		output:[
		                    			{
			                    			name: DType.string,
			                    			type: DType.string		                    				
		                    			}
		                    		]
		                    	}
		                    }
		                })
		            ]
		        })
		    ]
		}));
	}

	// entities
	for (var f in instances[orchestrator._credentials].entities) {
		var listOptions = [];
		var detailOptions = [];

		for (var verb in instances[orchestrator._credentials].entities[f]) {
			var p = instances[orchestrator._credentials].entities[f][verb];
			var iParams = [];
			var oParams = {};
			if (p.details.Arguments && p.details.Arguments.Input) {
				var args = p.details.Arguments.Input;
				for (var j=0;j<args.length;j++) {
					var pp = args[j];
					pp.type = pp.type.replace(/(int|double)\d*/i, 'number');
					iParams.push({
						name: pp.name,
						type: pp.type.toLowerCase(),
						place: pp.name=='id'?DType.path:DType.formData,
						description: ""
					});
				}
				iParams.push({
					name: "_callBackURL",
					type: DType.string,
					place: DType.query,
					description: "Leave empty for sync calls",
					required: false
				});
			}
			if (p.details.Arguments && p.details.Arguments.Output) {
				var args = p.details.Arguments.Output;
				for (var j=0;j<args.length;j++) {
					var pp = args[j];
					pp.type = pp.type.replace(/(int|double)\d*/i, 'number');
					oParams[pp.name] = pp.type.toLowerCase();
				}
			}

			switch(verb) {
				case 'list':
					listOptions.push(new Operation({
						summary: "List all entitiy IDs",
						method: DType.get,
						tags: 'Entity operations',
						parameters: iParams,
						responses: [
			                new Response({
			                	code: 503,
			                	description: "Folder structure is loading, please retry the call",
			                	schema: {error: DType.string}
			                }),
			                new Response({
			                	code: 202,
			                	description: "Used for async calls",
			                    schema: {jobId: DType.number}
			                }),
			                new Response({
			                	code: 200,
			                	description: "Used for sync calls",
			                    schema: {
			                    	StartTime: DType.string,
			                    	EndTime: DType.string,
			                    	State: DType.string,
			                    	Info: DType.string,
			                    	CreationTime: DType.string,
			                    	Result: oParams
			                    }
			                })
						]
		        	}));
					break;
				case 'read':
					detailOptions.push(new Operation({
			        	summary: "List an entity",
			            method: DType.get,
					    tags: 'Entity operations',
			            parameters: iParams,
			            responses: [
			                new Response({
			                	code: 503,
			                	description: "Folder structure is loading, please retry the call",
			                	schema: {error: DType.string}
			                }),
			                new Response({
			                	code: 202,
			                	description: "Used for async calls",
			                    schema: {jobId: DType.number}
			                }),
			                new Response({
			                	code: 200,
			                	description: "Used for sync calls",
			                    schema: {
			                    	StartTime: DType.string,
			                    	EndTime: DType.string,
			                    	State: DType.string,
			                    	Info: DType.string,
			                    	CreationTime: DType.string,
			                    	Result: oParams
			                    }
			                })
			            ]
			        }));
					break;
				case 'update':
					detailOptions.push(new Operation({
			        	summary: "Update an entity",
			            method: DType.patch,
					    tags: 'Entity operations',
			            parameters: iParams,
			            responses: [
			                new Response({
			                	code: 503,
			                	description: "Folder structure is loading, please retry the call",
			                	schema: {error: DType.string}
			                }),
			                new Response({
			                	code: 202,
			                	description: "Used for async calls",
			                    schema: {jobId: DType.number}
			                }),
			                new Response({
			                	code: 200,
			                	description: "Used for sync calls",
			                    schema: {
			                    	StartTime: DType.string,
			                    	EndTime: DType.string,
			                    	State: DType.string,
			                    	Info: DType.string,
			                    	CreationTime: DType.string,
			                    	Result: oParams
			                    }
			                })
			            ]
			        }));
					break;
				case 'create':
					listOptions.push(new Operation({
			        	summary: "Create an entity",
			            method: DType.post,
					    tags: 'Entity operations',
			            parameters: iParams,
			            responses: [
			                new Response({
			                	code: 503,
			                	description: "Folder structure is loading, please retry the call",
			                	schema: {error: DType.string}
			                }),
			                new Response({
			                	code: 202,
			                	description: "Used for async calls",
			                    schema: {jobId: DType.number}
			                }),
			                new Response({
			                	code: 200,
			                	description: "Used for sync calls",
			                    schema: {
			                    	StartTime: DType.string,
			                    	EndTime: DType.string,
			                    	State: DType.string,
			                    	Info: DType.string,
			                    	CreationTime: DType.string,
			                    	Result: oParams
			                    }
			                })
			            ]
			        }));
					break;
				case 'delete':
					detailOptions.push(new Operation({
			        	summary: "Delete an entity",
			            method: DType.delete,
					    tags: 'Entity operations',
			            parameters: iParams,
			            responses: [
			                new Response({
			                	code: 503,
			                	description: "Folder structure is loading, please retry the call",
			                	schema: {error: DType.string}
			                }),
			                new Response({
			                	code: 202,
			                	description: "Used for async calls",
			                    schema: {jobId: DType.number}
			                }),
			                new Response({
			                	code: 200,
			                	description: "Used for sync calls",
			                    schema: {
			                    	StartTime: DType.string,
			                    	EndTime: DType.string,
			                    	State: DType.string,
			                    	Info: DType.string,
			                    	CreationTime: DType.string,
			                    	Result: oParams
			                    }
			                })
			            ]
			        }));
					break;
			}
		}

		if (listOptions.length)
			paths.push(new API({
			    path: '/' + req.params.orgId + '/' + req.params.tenantName  + '/entities'+ f + '/',
			    operation: listOptions
			}));

		if (detailOptions.length)
			paths.push(new API({
			    path: '/' + req.params.orgId + '/' + req.params.tenantName  + '/entities'+ f + '/{id}',
			    operation: detailOptions
			}));
	}

	paths.push(new API({
	    path: '/' + req.params.orgId + '/' + req.params.tenantName  + '/jobs/{id}',
	    operation: [
	        new Operation({
	        	summary: "Queries the status of a job " + f,
	            method: DType.get,
			    tags: 'Job operations',
	            parameters: [{
	            	name: "id",
	            	place: DType.path
	            }],
	            responses: [
	                new Response({
	                	code: 503,
	                	description: "Folder structure is loading, please retry the call",
	                	schema: {error: DType.string}
	                }),
		            new Response({
	                    schema: {
	                    	"StartTime": DType.string,
	                    	"EndTime": DType.string,
	                    	"State": DType.string,
	                    	"Info": DType.string,
	                    	"CreationTime": DType.string,
	                    	"Result": DType.json
	                   	}
	                })
	            ]
	        })
	    ]
	}));

	var doc = new Document({
	    description: "Swagger deffinition",
	    version: "1.0.0",
	    title: "UiPath",
	    paths: paths
	});

	swaggerUi.setup(doc);
	next();
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(cookieParser());

app.get('/:orgId/:tenantName/docs', swaggerCB)
app.use('/:orgId/:tenantName/docs', swaggerUi.serve, swaggerUi.setup(swagger));
app.get ('/:orgId/:tenantName/refresh', refreshFolders);
app.get ('/:orgId/:tenantName/folders*.html', getFoldersHtml);
app.get ('/:orgId/:tenantName/folders*', getFolders);
app.get ('/:orgId/:tenantName/processes*.html', getProcesHtml);
app.get ('/:orgId/:tenantName/processes*', getProces);
app.post('/:orgId/:tenantName/processes/*', postProcess);
app.get('/:orgId/:tenantName/entities/*', getDeleteEntities);
app.delete('/:orgId/:tenantName/entities/*', getDeleteEntities);
app.post('/:orgId/:tenantName/entities/*', postPatchEntities);
app.patch('/:orgId/:tenantName/entities/*', postPatchEntities);
app.get('/:orgId/:tenantName/jobs/:id', getJobStatus);
app.post('/:orgId/:tenantName/auth', authenticate)

app.listen(port, () => {
  console.log(`Server listening on port ${port}`)
});

function escape(s) {
    return ('' + s)
        .replace(/\\/g, '\\\\')
        .replace(/\t/g, '\\t')
        .replace(/\n/g, '\\n')
        .replace(/\u00A0/g, '\\u00A0')
        .replace(/&/g, '\\x26')
        .replace(/'/g, '\\x27')
        .replace(/"/g, '\\x22')
        .replace(/</g, '\\x3C')
        .replace(/>/g, '\\x3E');
}

function unescape(s) {
    s = ('' + s)
       .replace(/\\x3E/g, '>')
       .replace(/\\x3C/g, '<')
       .replace(/\\x22/g, '"')
       .replace(/\\x27/g, "'")
       .replace(/\\x26/g, '&')
       .replace(/\\u00A0/g, '\u00A0')
       .replace(/\\n/g, '\n')
       .replace(/\\t/g, '\t');

    return s.replace(/\\\\/g, '\\');
}