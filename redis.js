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

var sys = require("sys");
var tcp = require("tcp");

var DEFAULT_PORT = 6379;
var DEFAULT_HOST = '127.0.0.1';

var conn, host, port;

// Connect to redis server.  This is most commonly to a redis-server instance
// running on the same host.

exports.connect = function(userOnConnectCallback, thePort, theHost) {
  port = thePort || DEFAULT_PORT;
  host = theHost || DEFAULT_HOST;

  writeDebugMessage('connecting to Redis instance on ' + host + ':' + port + "...");

  withConnection(userOnConnectCallback);
}

function withConnection(callback) {
  if (!conn || conn.readyState != "open") {
    conn = new process.tcp.Connection();

    conn.addListener("connect", function(){
      writeDebugMessage("connected.");
      
      conn.setEncoding("utf8");

      if (typeof(callback) == "function")
        callback();
    }); 

    conn.addListener("receive", function(data){
      if (exports.writeDebugMessageMode) 
        writeDebugMessage('< ' + data);

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

    conn.addListener("close", function(hadError){
      if (hadError) 
        fatal("disconnected from redis server in error -- redis server up?");
    });

    conn.connect(port, host);

  } else if (conn.readyState == "open" && typeof(callback) == "function") {
    callback();
  }
}

var CRLF = "\r\n";
var CRLF_LENGTH = 2;

// Commands supported by Redis 1.0
//
// Note: 'sort', 'quit', and 'slaveof' are handled as special cases.
//
// Note: 'monitor' is not included as that's generally only used 
// in a telnet connection to the redis-server instance.

var inlineCommands = {
  auth:1,
  bgsave:1,
  dbsize:1,
  decr:1,
  decrby:1,
  del:1,
  exists:1,
  expire:1,
  flushall:1,
  flushdb:1,
  get:1,
  incr:1,
  incrby:1,
  info:1,
  keys:1,
  lastsave:1,
  lindex:1,
  llen:1,
  lpop:1,
  lrange:1,
  ltrim:1,
  mget:1,
  move:1,
  randomkey:1,
  rename:1,
  renamenx:1,
  rpop:1,
  save:1,
  scard:1,
  sdiff:1,
  sdiffstore:1,
  select:1,
  shutdown:1,
  sinter:1,
  sinterstore:1,
  smembers:1,
  spop:1,
  sunion:1,
  sunionstore:1,
  ttl:1,
  type:1,
};

var bulkCommands = {
  getset:1,
  lpush:1,
  lrem:1,
  lset:1,
  rpush:1,
  sadd:1,
  set:1,
  setnx:1,
  sismember:1,
  smove:1,
  srem:1,
};

// callbacks:
// Node is event driven / asynchronous with respect to all I/O.  Thus, we call
// user code back when we parse Redis responses.  Note: redis responds in the
// same order as commands are sent.  Thus, pipelining is perfectly valid.  See
// the unit test(s) for examples of callbacks.

var callbacks = [];

exports.debugMode = false;

function writeDebugMessage(data) {
  if (!exports.debugMode || !data)
    return;

  sys.debug(data.replace(/\r/g, '<CR>').replace(/\n/g, '<LF>'));
}

function fatal(errorMessage) {
  writeDebugMessage("FATAL: " + errorMessage);
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

  // writeDebugMessage("formatBulk command=" + sys.inspect(commandName) + 
  //   "; args=" + sys.inspect(commandArgs) + "; count=" + argCount);

  var lastArg = typeof(commandArgs[argCount - 1]) != 'string' 
    ? commandArgs[argCount - 1].toString() 
    : commandArgs[argCount - 1];

  var cmd = args + ' ' + lastArg.length + CRLF + lastArg + CRLF;

  return cmd;
}

// Creates a function to send a command to the redis server.

function createCommandSender(commandName) {
  return function() {
    var args = arguments;

    withConnection(function() {
      // last arg (if any) should be callback function.

      var callback = null;
      var numArgs = args.length;

      if (typeof(args[args.length - 1]) == 'function') {
        callback = args[args.length - 1];
        numArgs = args.length - 1;
      }

      // Format the command and send it.

      var cmd;

      if (inlineCommands[commandName]) {
        cmd = formatInline(commandName, args, numArgs);
      } else if (bulkCommands[commandName]) {
        cmd = formatBulk(commandName, args, numArgs);
      } else { 
        fatal('unknown command ' + commandName);
      }
      
      writeDebugMessage('> ' + cmd);

      // Always push something, even if its null.
      // We need received replies to match number of entries in `callbacks`.

      callbacks.push({ cb:callback, cmd:commandName.toLowerCase() });
      conn.send(cmd);
    });
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

// Read this first: http://code.google.com/p/redis/wiki/SortCommand
// options is an object which can have the following properties:
//   'byPattern': 'pattern'
//   'limit': [start, end]
//   'getPatterns': [ 'pattern', 'pattern', ... ]
//   'ascending': true|false
//   'lexicographically': true|false

exports.sort = function(key, options, callback) {
  withConnection(function() {
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
    
    if (exports.writeDebugMessageMode) 
      writeDebugMessage('> ' + cmd);

    conn.send(cmd);

    // Always push something, even if its null.
    // We need received replies to match number of entries in `callbacks`.

    callbacks.push({ cb:callback, cmd:'sort' });
  });
}

// Close the connection.

exports.quit = function() {
  if (conn.readyState != "open") {
    conn.close();
    return;
  }

  writeDebugMessage('> quit');

  conn.send('quit' + CRLF);
  conn.close();
}

// Make the current redis instance we're connected to a master
// in a master-slave replication configuration.

exports.makeMaster = function() {
  withConnection(function() {
    writeDebugMessage('> slaveof no one');  // I am SPARTACUS!

    conn.send('slaveof no one');

    callbacks.push({ cb:null, cmd:'slaveof' });
  });
}

// Make the current redis instance we're connected to a slave
// in a master-slave replication configuration.

exports.makeSlaveOf = function(host, port) {
  withConnection(function() {
    port = port || DEFAULT_PORT;

    var cmd = 'slaveof ' + host + ' ' + port;

    writeDebugMessage('> ' + cmd);

    conn.send(cmd);

    callbacks.push({ cb:null, cmd:'slaveof' });
  });
}
