const Orchestrator = require('./uipath-orchestrator/Orchestrator.js');

module.exports.authenticateP = (orgId, tenantName, clientId, userKey, environment) => {
	return new Promise((resolve, reject) => {
		var oJSON = {
			serviceInstanceLogicalName: tenantName,
			path: orgId + "/" + tenantName,
			clientId: clientId,
			refreshToken: userKey
		};

		if(environment == "staging") {
			oJSON.hostname = 'staging.uipath.com';
			oJSON.authHostname = 'id-preprod.uipath.com';
		}

		var orchestrator = new Orchestrator(oJSON);

		orchestrator._login((err) => {
			if (err) {
				reject(err);
				return;
			}
			resolve(((environment == "staging")?"1":"0") + orchestrator._credentials);
		});
	});
};

module.exports.getOrchestrator = (tenantName, authToken) => {

	var oJSON = {
		tenancyName: tenantName,
		accessToken: authToken.substring(1)
	};

	if (authToken[0] == '1') {
		oJSON.hostname = 'staging.uipath.com';
		oJSON.authHostname = 'id-preprod.uipath.com';
	}

	var orchestrator = new Orchestrator(oJSON);
	orchestrator._getAccessToken();
	return orchestrator;
};

module.exports.getJobDetailsP = (orchestrator, ad) => {
	return new Promise((resolve, reject) => {
		var url = '/' + ad.orgId + '/' + ad.tenantName + '/orchestrator_/odata/Jobs('+ad.id+')';
		console.log("GET " + url);
		orchestrator.get(url, {}, function (err, data) {
			if (err) {
				console.error(err);
				reject(err);
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
			resolve(msg);
		});
	});
};


module.exports.getWebHooksP = (orchestrator, ad, websiteUrl) => {
	websiteUrl = websiteUrl.replace(/.*:\/\//, '');
	return new Promise((resolve, reject) => {
		var url = '/' + ad.orgId + '/' + ad.tenantName + "/orchestrator_/odata/Webhooks?$filter=((contains(Url,'"+websiteUrl+"')))";
		console.log("GET " + url);
		orchestrator.get(url, {}, function (err, data) {
			if (err) {
				console.error('Error: ' + err);
				reject(err);
				return;
			}
			resolve(data);
		});
	});
};

module.exports.addWebHookP = (orchestrator, ad, webHookURL, events) => {
	return new Promise((resolve, reject) => {
		var url = '/' + ad.orgId + '/' + ad.tenantName + "/orchestrator_/odata/Webhooks";
		console.log("POST " + url);
		var data = {
			"Url":webHookURL,
			"Enabled":true,
			"Secret":null,
			"SubscribeToAllEvents":false,
			"AllowInsecureSsl":false,
			"Events": events
		};

		orchestrator.post(url, data, function (err, data) {
			if (err) {
				console.error('Error: ' + err);
				reject(err);
				return;
			}
			resolve(data);
		});
	});
};




module.exports.getTransactionStatusP = (orchestrator, ad, fID) => {
	return new Promise((resolve, reject) => {
		var url = '/' + ad.orgId + '/' + ad.tenantName + '/orchestrator_/odata/QueueItems('+ad.id+')';
		console.log("GET " + url);
		orchestrator.switchOrganizationUnitId(fID);
		orchestrator.get(url, {}, function (err, data) {
			if (err) {
				console.error('Error: ' + err);
				reject(err);
				return;
			}
			resolve(data);
		});
	});
};

module.exports.startProcessP = (ad, orchestrator, fID, process, ia) => {
	return new Promise((resolve, reject) => {
		var apiQuery = {
			"startInfo": {
			    "ReleaseKey": process.details.Key,
			    "JobsCount": 1,
			    "JobPriority": "Normal",
			  //"RobotIds": []
			    "Strategy": "ModernJobsCount", // JobsCount
			  }
		};

		apiQuery.startInfo.InputArguments = JSON.stringify(ia);

		var url = '/' + ad.orgId + '/' + ad.tenantName + '/orchestrator_/odata/Jobs/UiPath.Server.Configuration.OData.StartJobs';
		console.log("POST " + url + ' (' + process.name + ')');
		orchestrator.switchOrganizationUnitId(fID);
		orchestrator.post(url, apiQuery, function (err, data) {
		  if (err) {
		    console.error('Error: ' + err);
		    reject(err);
		    return;
		  }
		  resolve(data.value[0].Id);
		});
	});
}

module.exports.addQueueItemP = (ad, orchestrator, fID, queue, qi) => {
	return new Promise((resolve, reject) => {
		if (qi.content) {
			try {
				qi.content = JSON.parse(qi.content);
				for (var key in qi.content) {
					if (typeof qi.content[key] == 'object' || typeof qi.content[key] == 'array')
						qi.content[key] = JSON.stringify(qi.content[key]);
				}
			} catch(e) {
				reject("Malformed queue item content: " + e);
			}
		} else 
			qi.content = {};
		var apiQuery = {
		  "itemData": {
		    "Name": queue.name,
		    "Priority": qi.priority,
		    "SpecificContent": qi.content,
		    "Reference": qi.reference
		    /*"DeferDate": "2022-04-11T15:25:19.260Z",
		    "DueDate": "2022-04-11T15:25:19.260Z",
		    "RiskSlaDate": "2022-04-11T15:25:19.260Z",
		    "Progress": "string"*/
		  }
		}

		var url = '/' + ad.orgId + '/' + ad.tenantName + '/orchestrator_/odata/Queues/UiPathODataSvc.AddQueueItem';
		console.log("POST " + url + ' (' + queue.name + ' in ' + fID + ')');
		orchestrator.switchOrganizationUnitId(fID);
		orchestrator.post(url, apiQuery, function (err, data) {
		  if (err) {
		    console.error('Error: ' + err);
		    reject(err);
		    return;
		  }
		  console.log("Job start requested.");
		  resolve(data.Id);
		});
	});
}

function _loadFolders(ad, orchestrator, fIDs, cb) {
	var apiQuery = {};
	var url = '/' + ad.orgId + '/' + ad.tenantName + '/orchestrator_/api/FoldersNavigation/GetFoldersPageForCurrentUser?skip=0';
	for (var key in fIDs)
		url += '&expandedParentIds=' + key;

	console.log("GET " + url.replace(/\?.*/, '') + ' (' + Object.keys(fIDs).join(', ') + ')');

	orchestrator.get(url, apiQuery, function (err, data) {
	    if (err) {
	        cb(null, err);
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
	    	_loadFolders(ad, orchestrator, fIDs, cb);
	    } else {
	    	cb(data, null);
	    }
	});
}

module.exports.loadFoldersP = (ad, orchestrator, fIDs) => {
	return new Promise((resolve, reject) => {
		_loadFolders(ad, orchestrator, fIDs, (data, err) => {
			if (err)
				reject(err);
			else
				resolve(data);
		});
	});
};

module.exports.loadProcessesP = (ad, orchestrator, fID, f) => {
	return new Promise((resolve, reject) => {
		var apiQuery = {};
		var url = '/' + ad.orgId + '/' + ad.tenantName + '/orchestrator_/odata/Releases?$select=Id,IsLatestVersion,IsProcessDeleted,ProcessKey,ProcessVersion,Description,Arguments,Name,JobPriority,FeedId,RequiresUserInteraction,ProcessType,EntryPoint,IsCompiled,TargetFramework,IsAttended,Tags,Key&$top=100&$expand=Environment,CurrentVersion,EntryPoint&$orderby=Name%20asc';
		orchestrator.switchOrganizationUnitId(fID);
		console.log("GET " + url.replace(/\?.*/, '') + ' (' + fID + ')');

		orchestrator.get(url, apiQuery, function (err, data) {
		    if (err) {
		    	reject(err)
		        return;
		    }
		    var processes = [];
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

		    	processes.push({
		    		folder: f,
		    		name: data.value[i].Name.replace(/[^\d\w_\-]/g, ''),
		    		details: data.value[i]
		    	});
		    }
		    resolve(processes);
		});	
	});
}

module.exports.loadQueuesP = (ad, orchestrator, fID, f) => {
	return new Promise((resolve, reject) => {
		var apiQuery = {};
		var url = '/' + ad.orgId + '/' + ad.tenantName + '/orchestrator_/odata/QueueDefinitions';
		orchestrator.switchOrganizationUnitId(fID);
		console.log("GET " + url.replace(/\?.*/, '') + ' (' + fID + ')');

		orchestrator.get(url, apiQuery, function (err, data) {
		    if (err) {
		    	reject(err)
		        return;
		    }
		    var queues = [];
		    for (var i=0;i<data.value.length;i++) {
				queues.push({
					folder: f,
					id: data.value[i].Id,
					name: data.value[i].Name.replace(/[^\d\w_\-]/g, '')
				});
		    }
		    resolve(queues);
		});
	});
}

module.exports.loadQueueDetailsP = (ad, orchestrator, fID, f, qID) => {
	return new Promise((resolve, reject) => {
		var apiQuery = {};
		var url = '/' + ad.orgId + '/' + ad.tenantName + '/orchestrator_/odata/QueueDefinitions('+qID+')';
		orchestrator.switchOrganizationUnitId(fID);
		console.log("GET " + url.replace(/\?.*/, '') + ' (' + fID + ')');

		orchestrator.get(url, apiQuery, function (err, data) {
		    if (err) {
		    	reject(err)
		        return;
		    }
		    var queue = {
		    	id: data.Id,
		    	fID: fID
		    };

		    try {
			    if (data.SpecificDataJsonSchema)
			    	queue.inSchema = JSON.parse(data.SpecificDataJsonSchema);
				if (data.OutputDataJsonSchema)
			    	queue.outSchema= JSON.parse(data.OutputDataJsonSchema);
			} catch(e) {
				reject(e);
			}

		    resolve(queue);
		});
	});
}