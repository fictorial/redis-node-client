// - create handlers for each type of response (inline, bulk, multi-bulk)
// - create formatters for each type of command (inline, bulk, multi-bulk)
// - Handle reconnecting sockets gracefully (if possible)
// - check for passing parseInt(), parseFloat() on data and auto-convert
// - support object<=>hash, array<=>list
// - test pipelining; should work great

var conn = new node.tcp.Connection();
conn.connect(6379, '127.0.0.1');

var callbacks = [];

exports.userConnectCallback = null;
exports.userDisconnectCallback = null;

conn.onConnect = function() {
  conn.setEncoding("utf8");
  if (exports.userConnectCallback)
    exports.userConnectCallback();
};

conn.onDisconnect = function(hadError) {
  if (hadError) 
    puts("disconnected from redis server in error");
  if (exports.userDisconnectCallback)
    exports.userDisconnectCallback();
};

var CRLF = "\r\n";

function formatInlineCommand(commandName, commandArgs, argCount) {
  var str = commandName;
  for (var i=0; i < argCount; ++i)
    str += ' ' + commandArgs[i];
  return str + CRLF;
}

function formatBulkCommand(commandName, commandArgs, argCount) {
  var payload = '';

  for (var i = 1; i < argCount; ++i) {
    payload += commandArgs[i];
    if (i < argCount - 1)
      payload += ' ';
  }

  return commandName    + ' '  + 
         commandArgs[0] + ' '  + 
         payload.length + CRLF + 
         payload        + CRLF;
}

var protocol = {
  set: formatBulkCommand,
  get: formatInlineCommand,
};

function makeHandler(commandName) {
  return function() {
    var callback = null;
    var numArgs = arguments.length;

    // last arg (if any) should be callback function.
    if (typeof(arguments[arguments.length - 1]) == 'function') {
      callback = arguments[arguments.length - 1];
      numArgs = arguments.length - 1;
    }

    var cmd = protocol[commandName](commandName, arguments, numArgs);

    var debugData = cmd.replace(/\r\n/g, '\\r\\n');
    puts('> ' + debugData);

    conn.send(cmd);

    // Always push something, even if its null.
    // We need received replies to match number of entries in `callbacks`.

    callbacks.push(callback);
  };
}

for (var commandName in protocol) {
  exports[commandName] = makeHandler(commandName);
}

function handleBulkReply(reply) {
  var crlfIndex = reply.indexOf(CRLF);
  var valueLength = parseInt(reply.substr(0, crlfIndex), 10);

  if (valueLength <= 0)
    puts("invalid length for data in bulk reply");

  var valueIndex = crlfIndex + 2;
  crlfIndex = reply.indexOf(CRLF, valueIndex);

  if (valueIndex >= reply.length || crlfIndex >= reply.length)
    puts("invalid value length specified");

  return reply.substr(valueIndex, crlfIndex);
}

function handleMultiBulkReply(reply) {
}

function handleSingleLineReply(reply) {
}

function handleIntegerReply(reply) {
}

function handleErrorReply(reply) {
  throw reply;
}

var replyPrefixToHandler = {
  '$': handleBulkReply,
  '*': handleMultiBulkReply,
  '+': handleSingleLineReply,
  ':': handleIntegerReply,
  '-': handleErrorReply
};

function dispatchReplyHandler(reply) {
  var prefix = reply.charAt(0);
  var replyHandler = replyPrefixToHandler[prefix];
  if (!replyHandler)
    puts("unknown response prefix: '" + prefix + "'");
  return replyHandler(reply.substr(1));
}

conn.onReceive = function(data) {
  var debugData = data.replace(/\r\n/g, '\\r\\n');
  puts('< ' + debugData);

  var result = dispatchReplyHandler(data);
  var callback = callbacks.shift();

  if (callback) 
    callback(result);
};

