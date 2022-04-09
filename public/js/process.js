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
			if (data.processName) {
				var template = Handlebars.compile($('#proces').html());
				data.fName = apiPath.replace(/.*\//, '');
				$('#proces').html(template(data));
				$('#proces').show();
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