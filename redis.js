// redis.js - a Redis client for server-side JavaScript, in particular Node
// which runs atop Google V8.
//
// Please review the Redis command reference and protocol specification:
// - http://code.google.com/p/redis/wiki/CommandReference
// - http://code.google.com/p/redis/wiki/ProtocolSpecification
//
// This implementation should make for easy maintenance given that Redis
// commands follow only a couple of conventions.  To add support for a new
// command, simply add the name to either 'inline_commands' or 'bulk_commands'
// below.
//
// Replies are handled generically and shouldn't need any updates unless Redis
// adds a completely new response type (other than status code, integer, error,
// bulk, and multi-bulk).  See http://code.google.com/p/redis/wiki/ReplyTypes
//
// Node is event driven / asynchronous with respect to all I/O.  Thus, we call
// user code back when we parse Redis responses.  Note: redis responds in the
// same order as commands are sent.  Thus, pipelining is perfectly valid.  See
// the unit test(s) for examples of callbacks.
//
// [Node](http://tinyclouds.org/node)
// [Google V8](http://code.google.com/p/v8)
//
// Author: Brian Hammond 
// Copyright (C) 2009 Fictorial LLC
// License: MIT

var sys = require("sys");
var tcp = require("tcp");

var CRLF        = "\r\n";
var CRLF_LENGTH = 2;

// Commands supported by Redis 1.0.  Note: 'sort', 'quit', and 'slaveof' are
// handled as special cases.  Note: 'monitor' is not included as that's
// generally only used in a telnet connection to the redis-server instance.

var inline_commands = { 
  auth:1, bgsave:1, dbsize:1, decr:1, decrby:1, del:1,
  exists:1, expire:1, flushall:1, flushdb:1, get:1, incr:1, incrby:1, info:1,
  keys:1, lastsave:1, lindex:1, llen:1, lpop:1, lrange:1, ltrim:1, mget:1,
  move:1, randomkey:1, rename:1, renamenx:1, rpop:1, save:1, scard:1, sdiff:1,
  sdiffstore:1, select:1, shutdown:1, sinter:1, sinterstore:1, smembers:1,
  spop:1, sunion:1, sunionstore:1, ttl:1, type:1 
};

var bulk_commands = { 
  getset:1, lpush:1, lrem:1, lset:1, rpush:1, sadd:1, set:1,
  setnx:1, sismember:1, smove:1, srem:1
};

function Client(port, host) {
  this.host      = host || '127.0.0.1';
  this.port      = port || 6379;
  this.callbacks = [];
  this.conn      = null;
}

// Creates a client and connects to the given host:port, then calls a given
// callback function (if any).

this.create_client = function(callback, port, host) {
  var client = new Client(port, host);
  client.with_connection(callback);
  return client;
}

// Ensures that the connection is established before calling the given callback
// function.  Sends 'this' as the first parameter to the callback (the Client).

Client.prototype.with_connection = function(callback) {
  var client = this;

  if (!this.conn || this.conn.readyState != "open") {
    this.conn = new process.tcp.Connection();

    this.conn.addListener("connect", function() {
      write_debug("connected.");
      
      this.setEncoding("utf8");
      this.setTimeout(0);          // try to stay connected.

      if (typeof(callback) == "function")
        callback(client);
    }); 

    this.conn.addListener("receive", function(data){
      if (GLOBAL.DEBUG) 
        write_debug('< ' + data);

      if (data.length == 0) 
        throw "empty response";

      var offset = 0;

      while (offset < data.length) {
        var reply_prefix  = data.charAt(offset);
        var reply_handler = reply_prefix_to_handler[reply_prefix];

        if (!reply_handler) 
          throw "unknown prefix " + reply_prefix + " in reply @ offset " + offset;

        var result_info = reply_handler(data, offset);
        var result      = result_info[0];
        offset          = result_info[1];

        var callback = client.callbacks.shift();
        if (callback && callback.fn) {
          result = post_process_results(callback.formatted_command, result);
          callback.fn(result);
        }
      }
    });

    this.conn.addListener("close", function(encountered_error) {
      if (encountered_error) 
        throw "disconnected from redis server in error -- redis server up?";
    });

    if (GLOBAL.DEBUG) 
      write_debug('connecting to Redis instance on ' 
        + this.host + ':' 
        + this.port + "...");

    this.conn.connect(this.port, this.host);
  } else if (this.conn.readyState == "open" && typeof(callback) == "function") {
    if (typeof(callback) == "function")
      callback(client);
  }
};

function write_debug(data) {
  if (!GLOBAL.DEBUG || !data)
    return;

  sys.debug(data.replace(/\r/g, '<CR>').replace(/\n/g, '<LF>'));
}

function try_convert_to_number(str) {
  if (/^\s*\d+\s*$/.test(str)) 
    return parseInt(str, 10);

  if (/^\s*\d+\.(\d+)?\s*$/.test(str))
    return parseFloat(str);

  return str;
}

// Format an inline redis command.
// See http://code.google.com/p/redis/wiki/ProtocolSpecification#Simple_INLINE_commands

function format_inline(command_name, command_args, arg_count) {
  var str = command_name;

  for (var i = 0; i < arg_count; ++i)
    str += ' ' + command_args[i];

  return str + CRLF;
}

// Format a bulk redis command.
// e.g. lset key index value => lset key index value-length\r\nvalue\r\n
// where lset is command_name; key, index, and value are command_args
// See http://code.google.com/p/redis/wiki/ProtocolSpecification#Bulk_commands

function format_bulk_command(command_name, command_args, arg_count) {
  var args = command_name;

  for (var i = 0; i < arg_count - 1; ++i) {
    var val = typeof(command_args[i]) != 'string' 
      ? command_args[i].toString() 
      : command_args[i];

    args += ' ' + val;
  }

  var lastArg = typeof(command_args[arg_count - 1]) != 'string' 
    ? command_args[arg_count - 1].toString() 
    : command_args[arg_count - 1];

  var formatted_command = args + ' ' + lastArg.length + CRLF + lastArg + CRLF;

  return formatted_command;
}

// Creates a function to send a command to the redis server.

function make_command_sender(command_name) {
  Client.prototype[command_name] = function() {
    var args = arguments;

    this.with_connection(function(client) {
      // last arg (if any) should be callback function.

      var callback  = null;
      var arg_count = args.length;

      if (typeof(args[args.length - 1]) == 'function') {
        callback  = args[args.length - 1];
        arg_count = args.length - 1;
      }

      // Format the command and send it.

      var formatted_command;

      if (inline_commands[command_name]) {
        formatted_command = format_inline(command_name, args, arg_count);
      } else if (bulk_commands[command_name]) {
        formatted_command = format_bulk_command(command_name, args, arg_count);
      } else { 
        throw 'unknown command ' + command_name;
      }
      
      write_debug('> ' + formatted_command);

      // Always push something, even if its null.
      // We need received replies to match number of entries in `callbacks`.

      client.callbacks.push({ fn:callback, formatted_command:command_name.toLowerCase() });
      client.conn.send(formatted_command);
    });
  };
}

// Create command senders for all commands.

for (var command_name in inline_commands)
  make_command_sender(command_name);

for (var command_name in bulk_commands)
  make_command_sender(command_name);

// All reply handlers are passed the full received data which may contain
// multiple replies.  Each should return [ result, offsetOfFollowingReply ]

function handle_bulk_reply(reply, offset) {
  ++offset; // skip '$'

  var crlf_index = reply.indexOf(CRLF, offset);
  var valueLength = parseInt(reply.substr(offset, crlf_index - offset), 10);

  if (valueLength == -1) 
    return [ null, crlf_index + CRLF_LENGTH ];

  var value = reply.substr(crlf_index + CRLF_LENGTH, valueLength);

  var nextOffset = crlf_index   + CRLF_LENGTH + 
                   valueLength + CRLF_LENGTH;

  return [ value, nextOffset ];
}

function handle_multi_bulk_reply(reply, offset) {
  ++offset; // skip '*'

  var crlf_index = reply.indexOf(CRLF, offset);
  var count = parseInt(reply.substr(offset, crlf_index - offset), 10);

  offset = crlf_index + CRLF_LENGTH;

  if (count === -1) 
    return [ null, offset ];

  var entries = [];

  for (var i = 0; i < count; ++i) {
    var bulkReply = handle_bulk_reply(reply, offset);
    entries.push(bulkReply[0]);
    offset = bulkReply[1];
  }

  return [ entries, offset ];
}

function handle_single_line_reply(reply, offset) {
  ++offset; // skip '+'

  var crlf_index = reply.indexOf(CRLF, offset);
  var value = reply.substr(offset, crlf_index - offset);

  // Most single-line replies are '+OK' so convert such to a true value. 

  if (value === 'OK') 
    value = true;

  return [ value, crlf_index + CRLF_LENGTH ];
}

function handle_integer_reply(reply, offset) {
  ++offset; // skip ':'

  var crlf_index = reply.indexOf(CRLF, offset);

  return [ parseInt(reply.substr(offset, crlf_index - offset), 10), 
           crlf_index + CRLF_LENGTH ];
}

function handle_error_reply(reply, offset) {
  ++offset; // skip '-'

  var crlf_index = reply.indexOf(CRLF, offset);

  var error_message = (reply.indexOf("ERR ") != 0)
    ? "something bad happened: " + reply.substr(offset, crlf_index - offset)
    : reply.substr(4, crlf_index - 4);

  throw error_message;
}

// See http://code.google.com/p/redis/wiki/ReplyTypes

var reply_prefix_to_handler = {
  '$': handle_bulk_reply,
  '*': handle_multi_bulk_reply,
  '+': handle_single_line_reply,
  ':': handle_integer_reply,
  '-': handle_error_reply
};

// INFO output is an object with properties for each server metadatum.
// KEYS output is a list (which is more intuitive than a ws-delimited string).

function post_process_results(command, result) {
  switch (command) {
  case 'info':
    var info_object = {};

    result.split('\r\n').forEach(function(line) {
      var parts = line.split(':');
      if (parts.length == 2)
        info_object[parts[0]] = try_convert_to_number(parts[1]);
    });

    result = info_object;
    break;

  case 'keys':
    result = result.split(' ');
    break;

  case 'lastsave':
    result = try_convert_to_number(result);
    break;

  default:
    break;
  }

  return result;
}

// Read this first: http://code.google.com/p/redis/wiki/SortCommand
// options is an object which can have the following properties:
//   'by_pattern': 'pattern'
//   'limit': [start, end]
//   'get_patterns': [ 'pattern', 'pattern', ... ]
//   'ascending': true|false
//   'lexicographically': true|false
//   'store_key': 'a_key_name'

Client.prototype.sort = function(key, options, callback) {
  this.with_connection(function(client) {
    var formatted_command = 'sort ' + key;

    if (typeof(options) == 'object') {
      var opt_by = options.by_pattern ? ('by ' + options.by_pattern) : '';

      var opt_get = '';
      if (options.get_patterns) {
        options.get_patterns.forEach(function(pat) {
          opt_get += 'get ' + pat + ' ';
        });
      }

      var opt_asc   = options.ascending         ? ''                : 'desc';
      var opt_alpha = options.lexicographically ? 'alpha'           : '';
      var opt_store = options.store_key         ? options.store_key : '';

      var opt_limit = options.limit 
        ? 'limit ' + options.limit[0] + ' ' + options.limit[1] 
        : '';

      formatted_command += ' ' + opt_by    + ' ' +
                                 opt_limit + ' ' +
                                 opt_get   + ' ' +
                                 opt_asc   + ' ' + 
                                 opt_alpha + ' ' + 
                                 opt_store + ' ' + CRLF;

      formatted_command = formatted_command.replace(/\s+$/, '') + CRLF;
    }
    
    if (GLOBAL.DEBUG) 
      write_debug('> ' + formatted_command);

    client.conn.send(formatted_command);

    // Always push something, even if its null.
    // We need received replies to match number of entries in `callbacks`.

    client.callbacks.push({ fn:callback, formatted_command:'sort' });
  });
}

// Close the connection.

Client.prototype.quit = function() {
  if (this.conn.readyState != "open") {
    this.conn.close();
    return;
  }
  write_debug('> quit');
  this.conn.send('quit' + CRLF);
  this.conn.close();
}

// Make the current redis instance we're connected to a master
// in a master-slave replication configuration.

Client.prototype.make_master = function() {
  this.with_connection(function(client) {
    write_debug('> slaveof no one');  // I am SPARTACUS!
    client.conn.send('slaveof no one');
    client.callbacks.push({ fn:null, formatted_command:'slaveof' });
  });
}

// Make the current redis instance we're connected to a slave
// in a master-slave replication configuration.

Client.prototype.make_slave_of = function(host, port) {
  this.with_connection(function(client) {
    port = port || DEFAULT_PORT;
    var formatted_command = 'slaveof ' + host + ' ' + port;
    write_debug('> ' + formatted_command);
    client.conn.send(formatted_command);
    client.callbacks.push({ fn:null, formatted_command:'slaveof' });
  });
}
