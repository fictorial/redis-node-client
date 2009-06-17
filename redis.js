exports.debug = true;

function dprint(data) {
  if (!exports.debug || !data)
    return;

  print(data.replace(/\r\n/g, '\\r\\n') + "\n");
}

function maybeConvertToNumber(str) {
  if (/^\s*\d+\s*$/.test(str)) 
    return parseInt(str, 10);

  if (/^\s*\d+\.(\d+)?\s*$/.test(str))
    return parseFloat(str);

  return str;
}

var conn = new node.tcp.Connection();
conn.connect(6379, '127.0.0.1');

var CRLF = "\r\n";

function formatInline(commandName, commandArgs, argCount) {
  var str = commandName;

  for (var i = 0; i < argCount; ++i)
    str += ' ' + commandArgs[i];

  return str + CRLF;
}

function formatBulk(commandName, commandArgs, argCount) {
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

// NB: sort and quit are handled as special cases.

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

var callbacks = [];

function createCommandSender(commandName) {
  return function() {
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
    }  

    if (!cmd) {
      dprint('warning: unknown command ' + commandName);
      return;
    }
      
    if (conn.readyState != "open")
      throw "connection is not open";

    // Always push something, even if its null.
    // We need received replies to match number of entries in `callbacks`.

    dprint('> ' + cmd);

    callbacks.push({ cb:callback, cmd:commandName.toLowerCase() });

    conn.send(cmd);
  };
}

for (var commandName in inlineCommands)
  exports[commandName] = createCommandSender(commandName);

for (var commandName in bulkCommands)
  exports[commandName] = createCommandSender(commandName);

// All reply handlers are passed the full received data which
// may contain multiple replies.  Each should return 
// [ replyData, offsetOfNextReply ]

function handleBulkReply(reply, offset) {
  ++offset; // skip '$'

  var crlfIndex = reply.indexOf(CRLF, offset);
  var valueLength = parseInt(reply.substr(offset, crlfIndex - offset), 10);

  if (valueLength <= 0)
    throw "invalid length for data in bulk reply";

  return [ reply.substr(crlfIndex + 2, valueLength), 
           crlfIndex + 2 + valueLength + 2 ];
}

function handleMultiBulkReply(reply, offset) {
  ++offset; // skip '*'

  var crlfIndex = reply.indexOf(CRLF, offset);
  var count = parseInt(reply.substr(offset, crlfIndex - offset), 10);

  if (count <= 0)
    throw "invalid length for data in multi bulk reply";

 offset = crlfIndex + 2;

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

  return [ value, crlfIndex + 2 ];
}

function handleIntegerReply(reply, offset) {
  ++offset; // skip ':'

  var crlfIndex = reply.indexOf(CRLF, offset);

  return [ parseInt(reply.substr(offset, crlfIndex - offset), 10), 
           crlfIndex + 2 ];
}

function handleErrorReply(reply, offset) {
  ++offset; // skip '-'

  var crlfIndex = reply.indexOf(CRLF, offset);

  if (reply.indexOf("ERR ") != 0)
    throw "something bad happened: " + reply.substr(offset, crlfIndex - offset);

  throw reply.substr(4, crlfIndex - 4);
}

var replyPrefixToHandler = {
  '$': handleBulkReply,
  '*': handleMultiBulkReply,
  '+': handleSingleLineReply,
  ':': handleIntegerReply,
  '-': handleErrorReply
};

function handleSpecialCases(command, result) {
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

  default:
    break;
  }

  return result;
}

conn.onReceive = function(data) {
//  dprint('  0.........1.........2.........3.........4.........5.........6.........7.........8.........9.........1.........2.........3.........4.........5');
//  dprint('  012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890');
  dprint('< ' + data);

  if (data.length == 0) 
    throw "empty response!";

  // Try to find as many FULL responses that are present in the received data.

  var offset = 0;
  while (offset < data.length) {
    var replyPrefix = data.charAt(offset);

    var replyHandler = replyPrefixToHandler[replyPrefix];
    if (typeof(replyHandler) != 'function') 
      throw "unknown response prefix: '" + replyPrefix + "' at offset " + offset;

    var resultInfo = replyHandler(data, offset);
    var result = resultInfo[0];
    offset = resultInfo[1];

    var callback = callbacks.shift();
    if (callback && callback.cb) {
      result = handleSpecialCases(callback.cmd, result);
      callback.cb(result);
    }
  }
};

// Read this first: http://code.google.com/p/redis/wiki/SortCommand
// options is an object which can have the following properties:
//   'byPattern': 'pattern'
//   'limit': [start, end]
//   'getPattern': 'pattern'
//   'ascending': true|false
//   'lexicographically': true|false

exports.sort = function(key, options, callback) {
  if (conn.readyState != "open")
    throw "connection is not open";

  var cmd = 'sort ' + key;

  if (typeof(options) == 'object') {
    var optBy  = options.byPattern  ? ('by '  + options.byPattern)  : '';
    var optGet = options.getPattern ? ('get ' + options.getPattern) : '';

    var optAsc   = options.ascending         ? 'asc'   : '';
    var optAlpha = options.lexicographically ? 'alpha' : '';

    var optLimit = options.optLimit 
      ? 'limit ' + options.limit[0] + ' ' + options.limit[1] 
      : '';

    cmd += optBy    + ' ' +
           optLimit + ' ' +
           optGet   + ' ' +
           optAsc   + ' ' + 
           optAlpha + ' ';
  }
  
  dprint('> ' + cmd);

  conn.send(cmd);

  // Always push something, even if its null.
  // We need received replies to match number of entries in `callbacks`.

  callbacks.push({ cb:callback, cmd:'sort' });
}

exports.quit = function() {
  if (conn.readyState != "open")
    throw "connection is not open";

  conn.send('quit' + CRLF);
  conn.close();
};

conn.onConnect = function() {
  conn.setEncoding("utf8");
};

conn.onDisconnect = function(hadError) {
  if (hadError) 
    throw "disconnected from redis server in error -- redis server up?";
};

