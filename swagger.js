const { Document, DType, Response, Operation, API } = require('swagger-generator-json')

function _transformId(params) {
	for (var i=0;i<params.length;i++) {
		if (params[i].name == 'id') {
			params[i].place = DType.path;
		}
	}
	return params;
}

function _getInputParams(args, cbAsGet) {
	var params = [];
	if (args && args.Input) {
		var ip = args.Input;
		for (var j=0;j<ip.length;j++) {
			var pp = ip[j];
			pp.type = pp.type.replace(/(int|double)\d*/i, 'number').toLowerCase();
			var p = {
				name: pp.name,
				type: pp.type,
				place: DType.formData,
				description: ""
			};
			if (p.type.match(/\[\]$/)) {
				p.type = p.type.replace(/\[\]$/, '');
				params.push([p]);
			}
			else
				params.push(p);
		}
		params.push({
			name: "_callBackURL",
			type: DType.string,
			place: cbAsGet?DType.query:DType.formData,
			description: "Leave empty for sync calls",
			required: false
		});
	}
	return params;
}

function _getOutputParams(args) {
	var params = {};
	if (args && args.Output) {
		var op = args.Output;
		for (var j=0;j<op.length;j++) {
			var pp = op[j];
			pp.type = pp.type.replace(/(int|double)\d*/i, 'number').toLowerCase();
			if (pp.type.match(/\[\]$/))
				params[pp.name] = [pp.type.replace(/\[\]$/, '')];
			else
				params[pp.name] = pp.type;
		}
	}
	return params;
}

module.exports.getPaths = (ad, instance) => {
	var paths = [];
	var fs = {};
	Object.assign(fs, {'/':0}, instance.folders);
	for (f in fs) {
		paths.push(new API({
		    path: '/' + ad.orgId + '/' + ad.tenantName  + '/folders'+ f,
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

	// processes
	for (var i=0;i<instance.processes.length;i++) {
		var p = instance.processes[i];
		var iParams = _getInputParams(p.details.Arguments);
		var oParams = _getOutputParams(p.details.Arguments);

		paths.push(new API({
		    path: '/' + ad.orgId + '/' + ad.tenantName  + '/processes'+ p.folder + '/' + p.name,
		    operation: [
		        new Operation({
		        	summary: "Starts the " + p.name + " process",
		            method: DType.post,
				    tags: 'Process operations',
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
		                    schema: {jobId: DType.number, pullUrl: DType.string}
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
	for (var f in instance.entities) {
		var listOptions = [];
		var detailOptions = [];

		for (var verb in instance.entities[f]) {
			var p = instance.entities[f][verb];
			var iParams = _getInputParams(p.details.Arguments, true);
			var oParams = _getOutputParams(p.details.Arguments);
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
			                    schema: {jobId: DType.number, pullUrl: DType.string}
			                }),
			                new Response({
			                	code: 200,
			                	description: "Used for sync calls",
								schema: oParams
			                })
						]
		        	}));
					break;
				case 'read':
					detailOptions.push(new Operation({
			        	summary: "List an entity",
			            method: DType.get,
					    tags: 'Entity operations',
			            parameters: _transformId(iParams),
			            responses: [
			                new Response({
			                	code: 503,
			                	description: "Folder structure is loading, please retry the call",
			                	schema: {error: DType.string}
			                }),
			                new Response({
			                	code: 202,
			                	description: "Used for async calls",
			                    schema: {jobId: DType.number, pullUrl: DType.string}
			                }),
			                new Response({
			                	code: 200,
			                	description: "Used for sync calls",
			                    schema: oParams
			                })
			            ]
			        }));
					break;
				case 'update':
					detailOptions.push(new Operation({
			        	summary: "Update an entity",
			            method: DType.patch,
					    tags: 'Entity operations',
			            parameters: _transformId(iParams),
			            responses: [
			                new Response({
			                	code: 503,
			                	description: "Folder structure is loading, please retry the call",
			                	schema: {error: DType.string}
			                }),
			                new Response({
			                	code: 202,
			                	description: "Used for async calls",
			                    schema: {jobId: DType.number, pullUrl: DType.string}
			                }),
			                new Response({
			                	code: 200,
			                	description: "Used for sync calls",
			                    schema: oParams
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
			                    schema: {jobId: DType.number, pullUrl: DType.string}
			                }),
			                new Response({
			                	code: 200,
			                	description: "Used for sync calls",
			                    schema: oParams
			                })
			            ]
			        }));
					break;
				case 'delete':
					detailOptions.push(new Operation({
			        	summary: "Delete an entity",
			            method: DType.delete,
					    tags: 'Entity operations',
			            parameters: _transformId(iParams),
			            responses: [
			                new Response({
			                	code: 503,
			                	description: "Folder structure is loading, please retry the call",
			                	schema: {error: DType.string}
			                }),
			                new Response({
			                	code: 202,
			                	description: "Used for async calls",
			                    schema: {jobId: DType.number, pullUrl: DType.string}
			                }),
			                new Response({
			                	code: 200,
			                	description: "Used for sync calls",
			                    schema: oParams
			                })
			            ]
			        }));
					break;
			}
		}

		if (listOptions.length)
			paths.push(new API({
			    path: '/' + ad.orgId + '/' + ad.tenantName  + '/entities'+ f + '/',
			    operation: listOptions
			}));

		if (detailOptions.length) {
			paths.push(new API({
			    path: '/' + ad.orgId + '/' + ad.tenantName  + '/entities'+ f + '/{id}',
			    operation: detailOptions
			}));
		}
	}

	// queues
	var qfs = {};
	for (var i=0;i<instance.queues.length;i++) {
		var q = instance.queues[i];
		qfs[q.folder] = 1;
		paths.push(new API({
		    path: '/' + ad.orgId + '/' + ad.tenantName  + '/queues'+ q.folder + '/' + q.name,
		    operation: [
		        new Operation({
		        	summary: "Gets " + q.name + " queue deffinition",
		            method: DType.get,
		            parameters: [],
				    tags: 'Queue operations',
		            responses: [
		                new Response({
		                	code: 503,
							description: "Folder structure is loading, please retry the call",
		                	schema: {error: DType.string}
		                }),
		                new Response({
		                	code: 200,
		                    schema: {
		                    	id: DType.string,
		                    	name: DType.string,
		                    	inSchema: DType.string,
		                    	outSchema: DType.string
		                    }
		                })
		            ]
		        }),
		        new Operation({
		        	summary: "Adds a queue item to the " + q.name + " queue",
		            method: DType.post,
				    tags: 'Queue operations',
		            parameters: [
		            	{
            				name: "reference",
							type: DType.string,
							place: DType.formData,
							description: ""
						},
						{
            				name: "priority",
							type: DType.string,
							place: DType.formData,
							description: "High, Normal or Low"
						},
						{
            				name: "content",
							type: DType.string,
							place: DType.formData,
							description: "1-level JSON object"
						},
						{
            				name: "_callBackURL",
							type: DType.string,
							place: DType.formData,
							required: false,
							description: "Leave empty for sync calls"
						}
		            ],
		            responses: [
		                new Response({
		                	code: 503,
							description: "Folder structure is loading, please retry the call",
		                	schema: {error: DType.string}
		                }),
		                new Response({
		                	code: 202,
		                	description: "Used for async calls",
		                    schema: {transactionId: DType.number, pullUrl: DType.string}
		                }),
		                new Response({
		                	code: 200,
		                	description: "Used for sync calls",
		                    schema: {
		                    	"Status": DType.string,
		                    	"Output": DType.json,
		                    	"ProcessingExceptionType": DType.string,
		                    	"ProcessingException": DType.string
		                    }
		                })
		            ]
		        })
		    ]
		}));
	}

	paths.push(new API({
	    path: '/' + ad.orgId + '/' + ad.tenantName  + '/jobs/{id}',
	    operation: [
	        new Operation({
	        	summary: "Queries the status of a job " + f,
	            method: DType.get,
			    tags: 'Job and Transactions operations',
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

	for (var qf in qfs) {
		paths.push(new API({
		    path: '/' + ad.orgId + '/' + ad.tenantName  + '/transactions'+qf+'/{id}',
		    operation: [
		        new Operation({
		        	summary: "Queries the status of a transaction item in " + qf,
		            method: DType.get,
				    tags: 'Job and Transactions operations',
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
		                    	"Status": DType.string,
		                    	"Output": DType.json,
		                    	"ProcessingExceptionType": DType.string,
		                    	"ProcessingException": DType.string
		                   	}
		                })
		            ]
		        })
		    ]
		}));
	}

	return paths;
}