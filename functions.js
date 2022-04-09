module.exports.escape = (s) => {
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
};

module.exports.unescape = (s) => {
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
};

function _cleanUpEntities (o) {
    if (typeof o == "object")
        for (k in o) {
            switch(k) {
                case 'CreatedBy':
                case 'CreateTime':
                case 'UpdatedBy':
                case 'UpdateTime':
                    delete o[k];
                    break;
                default: 
                    o[k] = _cleanUpEntities(o[k]);
            }
        }
    else if (typeof o == "array")
        for (var i=0;i<o.length;i++) {
            o[i] = _cleanUpEntities(o[i]);
        }
    return o;
}
module.exports.cleanUpEntities = _cleanUpEntities;
