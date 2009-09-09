// redis.js - a Redis client for server-side JavaScript, in particular Node
// which runs atop Google V8.
//
// Please review the Redis command reference and protocol specification:
//
// http://code.google.com/p/redis/wiki/CommandReference
// http://code.google.com/p/redis/wiki/ProtocolSpecification
//
// This implementation should make for easy maintenance given that Redis
// commands follow only a couple of conventions.  To add support for a new
// command, simply add the name to either 'inlineCommands' or 'bulkCommands'
// below.
//
// Replies are handled generically and shouldn't need any updates unless Redis
// adds a completely new response type (other than status code, integer, error,
// bulk, and multi-bulk).  See http://code.google.com/p/redis/wiki/ReplyTypes
//
// To learn more about Node and Google V8, see http://tinyclouds.org/node/ and
// http://code.google.com/p/v8/ respectively.
//
// Brian Hammond, Fictorial
//
// Thanks to:
// - Elliott Cable for Node.js 0.1.7 API changes and unit test enhancements.

var conn = new node.tcp.Connection();

// Connect to redis server.  This is most commonly to a redis-server instance
// running on the same host.

exports.connect = function(onConnect, port, host) {
  port = port || 6379;
  host = host || '127.0.0.1';

  node.debug('connecting to ' + host + ':' + port);

  conn.connect(port, host);
  
  conn.addListener("connect", function(){
    conn.setEncoding("utf8");
    onConnect();
  });
}

var CRLF = "\r\n";
var CRLF_LENGTH = 2;

// Commands supported by Redis (as of June, 2009).
// Note: 'sort' and 'quit' are handled as special cases.

var inlineCommands = {
  auth:1,        get:1,         mget:1,        incr:1,        incrby:1,
  decr:1,        decrby:1,      exists:1,      del:1,         type:1,
  keys:1,        randomkey:1,   rename:1,      renamenx:1,    dbsize:1,
  expire:1,      ttl:1,         llen:1,        lrange:1,      ltrim:1,
  lindex:1,      lpop:1,        rpop:1,        scard:1,       sinter:1,
  sinterstore:1, sunion:1,      sunionstore:1, smembers:1,    select:1,
  move:1,        flushdb:1,     flushall:1,    save:1,        bgsave:1,
  lastsave:1,    shutdown:1,    info:1
};

var bulkCommands = {
  set:1,         getset:1,      setnx:1,       rpush:1,       lpush:1,
  lset:1,        lrem:1,        sadd:1,        srem:1,        smove:1,
  sismember:1
};

// callbacks:
// Node is event driven / asynchronous with respect to all I/O.  Thus, we call
// user code back when we parse Redis responses.  Note: redis responds in the
// same order as commands are sent.  Thus, pipelining is perfectly valid.  See
// the unit test(s) for examples of callbacks.

var callbacks = [];

// debugMode:
// We don't use print() or puts() immediately as they are asynchronous in Node;
// the instant there's a runtime error raised by V8, any pending I/O in Node is
// dropped.  Thus, we simply append to a string.  When *we* cause a runtime
// error via throw in debugMode, we dump all output, *then* throw.  This is
// useful for, well, debugging.  Otherwise, turn off debugMode (which is the
// default).

exports.debugMode = false;

function debug(data) {
  if (!exports.debugMode || !data)
    return;

  node.debug(data.replace(/\r\n/g, '\\r\\n'));
}

function fatal(errorMessage) {
  debug("\n\nFATAL: " + errorMessage + "\n");
  throw errorMessage;
}

function maybeConvertToNumber(str) {
  if (/^\s*\d+\s*$/.test(str)) 
    return parseInt(str, 10);

  if (/^\s*\d+\.(\d+)?\s*$/.test(str))
    return parseFloat(str);

  return str;
}

// Format an inline redis command.
// See http://code.google.com/p/redis/wiki/ProtocolSpecification#Simple_INLINE_commands

function formatInline(commandName, commandArgs, argCount) {
  var str = commandName;

  for (var i = 0; i < argCount; ++i)
    str += ' ' + commandArgs[i];

  return str + CRLF;
}

// Format a bulk redis command.
// e.g. lset key index value => lset key index value-length\r\nvalue\r\n
// where lset is commandName; key, index, and value are commandArgs
// See http://code.google.com/p/redis/wiki/ProtocolSpecification#Bulk_commands

function formatBulk(commandName, commandArgs, argCount) {
  var args = commandName;

  for (var i = 0; i < argCount - 1; ++i) {
    var val = typeof(commandArgs[i]) != 'string' 
      ? commandArgs[i].toString() 
      : commandArgs[i];

    args += ' ' + val;
  }

  var lastArg = typeof(commandArgs[argCount - 1]) != 'string' 
    ? commandArgs[argCount - 1].toString() 
    : commandArgs[argCount - 1];

  var cmd = args + ' ' + lastArg.length + CRLF + lastArg + CRLF;

  return cmd;
}

// Creates a function to send a command to the redis server.

function createCommandSender(commandName) {
  return function() {
    if (conn.readyState != "open") 
      fatal("connection is not open");

    // last arg (if any) should be callback function.

    var callback = null;
    var numArgs = arguments.length;

    if (typeof(arguments[arguments.length - 1]) == 'function') {
      callback = arguments[arguments.length - 1];
      numArgs = arguments.length - 1;
    }

    // Format the command and send it.

    var cmd;

    if (inlineCommands[commandName]) {
      cmd = formatInline(commandName, arguments, numArgs);
    } else if (bulkCommands[commandName]) {
      cmd = formatBulk(commandName, arguments, numArgs);
    } else { 
      fatal('unknown command ' + commandName);
    }
      
    debug('> ' + cmd);

    // Always push something, even if its null.
    // We need received replies to match number of entries in `callbacks`.

    callbacks.push({ cb:callback, cmd:commandName.toLowerCase() });
    conn.send(cmd);
  };
}

// Create command senders for all commands.

for (var commandName in inlineCommands)
  exports[commandName] = createCommandSender(commandName);

for (var commandName in bulkCommands)
  exports[commandName] = createCommandSender(commandName);

// All reply handlers are passed the full received data which may contain
// multiple replies.  Each should return [ result, offsetOfFollowingReply ]

function handleBulkReply(reply, offset) {
  ++offset; // skip '$'

  var crlfIndex = reply.indexOf(CRLF, offset);
  var valueLength = parseInt(reply.substr(offset, crlfIndex - offset), 10);

  if (valueLength == -1) 
    return [ null, crlfIndex + CRLF_LENGTH ];

  var value = reply.substr(crlfIndex + CRLF_LENGTH, valueLength);

  var nextOffset = crlfIndex   + CRLF_LENGTH + 
                   valueLength + CRLF_LENGTH;

  return [ value, nextOffset ];
}

function handleMultiBulkReply(reply, offset) {
  ++offset; // skip '*'

  var crlfIndex = reply.indexOf(CRLF, offset);
  var count = parseInt(reply.substr(offset, crlfIndex - offset), 10);

  offset = crlfIndex + CRLF_LENGTH;

  if (count === -1) 
    return [ null, offset ];

  var entries = [];

  for (var i = 0; i < count; ++i) {
    var bulkReply = handleBulkReply(reply, offset);
    entries.push(bulkReply[0]);
    offset = bulkReply[1];
  }

  return [ entries, offset ];
}

function handleSingleLineReply(reply, offset) {
  ++offset; // skip '+'

  var crlfIndex = reply.indexOf(CRLF, offset);
  var value = reply.substr(offset, crlfIndex - offset);

  // Most single-line replies are '+OK' so convert such to a true value. 

  if (value === 'OK') 
    value = true;

  return [ value, crlfIndex + CRLF_LENGTH ];
}

function handleIntegerReply(reply, offset) {
  ++offset; // skip ':'

  var crlfIndex = reply.indexOf(CRLF, offset);

  return [ parseInt(reply.substr(offset, crlfIndex - offset), 10), 
           crlfIndex + CRLF_LENGTH ];
}

function handleErrorReply(reply, offset) {
  ++offset; // skip '-'

  var crlfIndex = reply.indexOf(CRLF, offset);

  var errorMessage = (reply.indexOf("ERR ") != 0)
    ? "something bad happened: " + reply.substr(offset, crlfIndex - offset)
    : reply.substr(4, crlfIndex - 4);

  fatal(errorMessage);
}

// See http://code.google.com/p/redis/wiki/ReplyTypes

var replyPrefixToHandler = {
  '$': handleBulkReply,
  '*': handleMultiBulkReply,
  '+': handleSingleLineReply,
  ':': handleIntegerReply,
  '-': handleErrorReply
};

// INFO output is an object with properties for each server metadatum.
// KEYS output is a list (which is more intuitive than a ws-delimited string).

function postProcessResults(command, result) {
  switch (command) {
  case 'info':
    var infoObject = {};

    result.split('\r\n').forEach(function(line) {
      var parts = line.split(':');
      if (parts.length == 2)
        infoObject[parts[0]] = maybeConvertToNumber(parts[1]);
    });

    result = infoObject;
    break;

  case 'keys':
    result = result.split(' ');
    break;

  case 'lastsave':
    result = maybeConvertToNumber(result);
    break;

  default:
    break;
  }

  return result;
}

conn.addListener("receive", function(data){
  if (exports.debugMode) 
    debug('< ' + data);

  if (data.length == 0) 
    fatal("empty response");

  var offset = 0;

  while (offset < data.length) {
    var replyPrefix = data.charAt(offset);
    var replyHandler = replyPrefixToHandler[replyPrefix];

    if (!replyHandler) 
      fatal("unknown prefix " + replyPrefix + " in reply @ offset " + offset);

    var resultInfo = replyHandler(data, offset);
    var result = resultInfo[0];
    offset = resultInfo[1];

    var callback = callbacks.shift();
    if (callback && callback.cb) {
      result = postProcessResults(callback.cmd, result);
      callback.cb(result);
    }
  }
});

// Read this first: http://code.google.com/p/redis/wiki/SortCommand
// options is an object which can have the following properties:
//   'byPattern': 'pattern'
//   'limit': [start, end]
//   'getPatterns': [ 'pattern', 'pattern', ... ]
//   'ascending': true|false
//   'lexicographically': true|false

exports.sort = function(key, options, callback) {
  if (conn.readyState != "open")
    fatal("connection is not open");

  var cmd = 'sort ' + key;

  if (typeof(options) == 'object') {
    var optBy = options.byPattern ? ('by ' + options.byPattern) : '';

    var optGet = '';
    if (options.getPatterns) {
      options.getPatterns.forEach(function(pat) {
        optGet += 'get ' + pat + ' ';
      });
    }

    var optAsc   = options.ascending         ? ''      : 'desc';
    var optAlpha = options.lexicographically ? 'alpha' : '';

    var optLimit = options.limit 
      ? 'limit ' + options.limit[0] + ' ' + options.limit[1] 
      : '';

    cmd += ' ' + optBy    + ' ' +
                 optLimit + ' ' +
                 optGet   + ' ' +
                 optAsc   + ' ' + 
                 optAlpha + ' ' + CRLF;

    cmd = cmd.replace(/\s+$/, '') + CRLF;
  }
  
  if (exports.debugMode) 
    debug('> ' + cmd);

  conn.send(cmd);

  // Always push something, even if its null.
  // We need received replies to match number of entries in `callbacks`.

  callbacks.push({ cb:callback, cmd:'sort' });
}

// Close the connection.

exports.quit = function() {
  if (conn.readyState != "open")
    fatal("connection is not open");

  debug('> quit');

  conn.send('quit' + CRLF);
  conn.close();
}

conn.addListener("close", function(hadError){
  if (hadError) 
    fatal("disconnected from redis server in error -- redis server up?");
});
