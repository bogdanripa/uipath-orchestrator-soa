Handlebars.registerHelper('contains', function(needle, haystack, options) {
   needle = Handlebars.escapeExpression(needle);
   haystack = Handlebars.escapeExpression(haystack);
   return (haystack.indexOf(needle) > -1) ? options.fn(this) : options.inverse(this);
});

function loadData() {
	var apiPath = document.location.pathname.replace(/\.html$/, '');
	var swaggerURL = apiPath.replace(/^(\/.*?\/.*?\/).*$/, "$1docs/");
	$('#swagger').attr('href', swaggerURL);
	$.get(apiPath)
		.done((data, a, b) => {
			if (data.error) {
				alert(data.error);
				return;
			}
			$('#loading').hide();
			if (data.folders) {
				var template = Handlebars.compile($('#folders').html());
				data.fName = apiPath.replace(/.*\//, '');
				data.parentName = apiPath.replace(/\/[^\/]*$/, '.html');
				$('#folders').html(template(data));
				$('#folders').show();
			}
			if (data.processes) {
				if (data.processes && data.processes.length > 0) {
					var template = Handlebars.compile($('#processes').html());
					data.fName = apiPath.replace("/folders/", "/processes/");
					$('#processes').html(template(data));
					$('#processes').show();
				}
			}
		})
		.fail((xhr, status, error) => {
			if (xhr.status == 503) {
				setTimeout(loadData, 1000);
				return;
			}
			alert(error);
		});
}
$(loadData);