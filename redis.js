// Redis client for Node.js
// Author: Brian Hammond <brian at fictorial dot com>
// Copyright (C) 2009 Fictorial LLC
// License: MIT

var sys = require("sys"), 
    tcp = require("tcp");

var crlf = "\r\n", 
    crlf_len = 2;


var inline_commands = { 
  auth:1, bgsave:1, dbsize:1, decr:1, decrby:1, del:1,
  exists:1, expire:1, flushall:1, flushdb:1, get:1, incr:1, incrby:1, info:1,
  keys:1, lastsave:1, lindex:1, llen:1, lpop:1, lrange:1, ltrim:1, mget:1,
  move:1, randomkey:1, rename:1, renamenx:1, rpop:1, save:1, scard:1, sdiff:1,
  sdiffstore:1, select:1, shutdown:1, sinter:1, sinterstore:1, smembers:1,
  spop:1, srandmember:1, sunion:1, sunionstore:1, ttl:1, type:1, 
  zrange:1, zrevrange:1, zcard:1, zrangebyscore:1
};

var bulk_commands = { 
  getset:1, lpush:1, lrem:1, lset:1, rpush:1, sadd:1, set:1,
  setnx:1, sismember:1, smove:1, srem:1, zadd:1, zrem:1, zscore:1
};

var Client = exports.Client = function (port, host) {
  this.host = host || '127.0.0.1';
  this.port = port || 6379;
  this.callbacks = [];
  this.conn = null;
};

// Callback a function after we've ensured we're connected to Redis.

Client.prototype.connect = function (callback_on_connect) {
  var self = this;
  if (this.conn && this.conn.readyState === "open") {
    if (typeof(callback_on_connect) === "function")
      callback_on_connect();
  } else {
    this.conn = new process.tcp.Connection();
    this.conn.addListener("connect", function () {
      this.setEncoding("binary");
      this.setTimeout(0);          // try to stay connected.
      this.setNoDelay();
      if (typeof(callback_on_connect) === "function")
        callback_on_connect();
    }); 
    this.conn.addListener("receive", function (data) {
      if (!self.buffer)
        self.buffer = "";
      self.buffer += data;
      self.handle_replies();
    });
    this.conn.addListener("close", function (encountered_error) {
      if (encountered_error) 
        throw new Error("redis server up?");
    });
    this.conn.connect(this.port, this.host);
  }
};

Client.prototype.close = function () {
  if (this.conn && this.conn.readyState === "open") {
    this.conn.close();
    this.conn = null;
  }
};

// Reply handlers read replies from the current reply buffer.  At the time of
// the call the buffer will start with at least the prefix associated with the
// relevant reply type which is at this time always of length 1.  
//
// Note the buffer may not contain a full reply in which case these reply
// handlers return null.  In this case the buffer is left intact for future
// "receive" events to append onto, and the read-replies process repeats.
// Repeat ad infinitum.  
//
// Each handler returns [ value, next_command_index ] on success, null on
// underflow.

var prefix_len = 1;

// Bulk replies resemble:
// $6\r\nFOOBAR\r\n

Client.prototype.handle_bulk_reply = function (start_at, buf) {
  var buffer = buf || this.buffer;
  start_at = (start_at || 0) + prefix_len;
  var crlf_at = buffer.indexOf(crlf, start_at);
  if (crlf_at === -1) 
    return null;
  var value_len_str = buffer.substring(start_at, crlf_at);
  var value_len = parseInt(value_len_str, 10);
  if (value_len === NaN) 
    throw new Error("invalid bulk value len: " + value_len_str);
  if (value_len === -1)                 // value doesn't exist
    return [ null, crlf_at + crlf_len ];  
  var value_at = crlf_at + crlf_len;
  var next_reply_at = value_at + value_len + crlf_len;
  if (next_reply_at > buffer.length)
    return null;
  var value = buffer.substr(value_at, value_len);
  return [ value, next_reply_at ];
}

// Mult-bulk replies resemble:
// *4\r\n$3\r\nFOO\r\n$3\r\nBAR\r\n$5\r\nHELLO\r\n$5\r\nWORLD\r\n
// *4 is the number of bulk replies to follow.

Client.prototype.handle_multi_bulk_reply = function (buf) {
  var buffer = buf || this.buffer;
  var crlf_at = buffer.indexOf(crlf, prefix_len);
  if (crlf_at === -1) 
    return null;
  var count_str = buffer.substring(prefix_len, crlf_at);
  var count = parseInt(count_str, 10);
  if (count === NaN) 
    throw new Error("invalid multi-bulk count: " + count_str);
  var next_reply_at = crlf_at + crlf_len;
  if (count === -1)                   // value doesn't exist
    return [ null, next_reply_at ];  
  if (next_reply_at >= buffer.length) 
    return null;
  var results = [];
  for (var i = 0; i < count; ++i) {
    var bulk_reply = this.handle_bulk_reply(next_reply_at, buffer);
    if (bulk_reply === null)             // no full multi-bulk cmd
      return null;
    var bulk_reply_value = bulk_reply[0];
    results.push(bulk_reply_value);
    next_reply_at = bulk_reply[1];
  }
  return [ results, next_reply_at ];
};

// Single line replies resemble:
// +OK\r\n

Client.prototype.handle_single_line_reply = function (buf) {
  var buffer = buf || this.buffer;
  var crlf_at = buffer.indexOf(crlf, prefix_len);
  if (crlf_at === -1) 
    return null;
  var value = buffer.substring(prefix_len, crlf_at);
  if (value === 'OK') 
    value = true;
  var next_reply_at = crlf_at + crlf_len;
  return [ value, next_reply_at ];
};

// Integer replies resemble:
// :1000\r\n

Client.prototype.handle_integer_reply = function (buf) {
  var buffer = buf || this.buffer;
  var crlf_at = buffer.indexOf(crlf, prefix_len);
  if (crlf_at === -1) 
    return null;
  var value_str = buffer.substring(prefix_len, crlf_at);
  var value = parseInt(value_str, 10);
  if (value === NaN) 
    throw new Error("invalid integer reply: " + value_str);
  var next_reply_at = crlf_at + crlf_len;
  return [ value, next_reply_at ];
};

// Error replies resemble:
// -ERR you suck at tennis\r\n

Client.prototype.handle_error_reply = function (buf) {
  var buffer = buf || this.buffer;
  var crlf_at = buffer.indexOf(crlf, prefix_len);
  if (crlf_at === -1) 
    return null;
  var value = buffer.substring(prefix_len, crlf_at);
  var next_reply_at = crlf_at + crlf_len;
  if (value.indexOf("ERR ") === 0)
    value = value.substr("ERR ".length);
  return [ value, next_reply_at ];
}

// Try to read as many replies from the current buffer as we can.  Leave
// partial replies in the buffer, else eat 'em.  Dispatch any promises waiting
// for these replies.  Error replies emit error on the promise, else success is
// emitted.

Client.prototype.handle_replies = function () {
  while (this.buffer.length > 0) {
    if (GLOBAL.DEBUG) {
      write_debug('---');
      write_debug('buffer: ' + this.buffer);
    }
    var prefix = this.buffer.charAt(0);
    var result, is_error = false;
    switch (prefix) {
      case '$': result = this.handle_bulk_reply();                   break;
      case '*': result = this.handle_multi_bulk_reply();             break;
      case '+': result = this.handle_single_line_reply();            break;
      case ':': result = this.handle_integer_reply();                break;
      case '-': result = this.handle_error_reply(); is_error = true; break;
    }
    // The handlers return null when there's not enough data
    // in the buffer to read a full reply.  Leave the buffer alone until
    // we receive more data.
    if (result === null) 
      break;
    if (GLOBAL.DEBUG) {
      write_debug('prefix: ' + prefix);
      write_debug('result: ' + JSON.stringify(result));
    }
    var next_reply_at = result[1];
    this.buffer = this.buffer.substring(next_reply_at);
    var callback = this.callbacks.shift();
    if (callback.promise) {
      var result_value = result[0];
      if (is_error) 
        callback.promise.emitError(result_value);
      else {
        result_value = post_process_results(callback.command, result_value);
        callback.promise.emitSuccess(result_value);
      }
    }
  }
};

function write_debug(data) {
  if (!GLOBAL.DEBUG || !data) return;
  sys.puts(data.replace(/\r\n/g, '<CRLF>'));
}

function try_convert_to_number(str) {
  var value = parseInt(str, 10);
  if (value === NaN) 
    value = parseFloat(str);
  if (value === NaN) 
    return str;
  return value;
}

function format_inline(name, args) {
  var command = name;
  for (var arg in args) 
    command += ' ' + args[arg].toString();
  return command + crlf;
}

function format_bulk_command(name, args) {
  var output = name;
  for (var i = 0; i < args.length - 1; ++i) 
    output += ' ' + args[i].toString();
  var last_arg = args[args.length - 1].toString();
  return output + ' ' + last_arg.length + crlf + last_arg + crlf;
}

function make_command_sender(name) {
  Client.prototype[name] = function () {
    if (GLOBAL.DEBUG) {
      var description = "client." + name + "( ";
      for (var a in arguments) 
        description += "'" + arguments[a] + "',";
      description = description.substr(0, description.length - 1) + " )";
    }
    var args = arguments;    
    var self = this;
    var promise = new process.Promise();
    this.connect(function () {
      var command;
      if (inline_commands[name]) 
        command = format_inline(name, args);
      else if (bulk_commands[name]) 
        command = format_bulk_command(name, args);
      else 
        throw new Error('unknown command type for "' + name + '"');
      if (GLOBAL.DEBUG) {
        write_debug("---");
        write_debug("call:   " + description);
        write_debug("command:" + command);
      }
      self.callbacks.push({ promise:promise, command:name.toLowerCase() });
      self.conn.send(command);
    });
    return promise;
  };
}

for (var name in inline_commands) 
  make_command_sender(name);

for (var name in bulk_commands)   
  make_command_sender(name);

function post_process_results(command, result) {
  var new_result = result;
  switch (command) {
    case 'info':
      var info = {};
      result.split(/\r\n/g).forEach(function (line) {
        var parts = line.split(':');
        if (parts.length === 2)
          info[parts[0]] = try_convert_to_number(parts[1]);
      });
      new_result = info;
      break;
    case 'keys': 
      new_result = result.split(' '); 
      break;
    case 'lastsave': 
      new_result = try_convert_to_number(result); 
      break;
    default: 
      break;
  }
  return new_result;
}

// Read this: http://code.google.com/p/redis/wiki/SortCommand
// 'key' is what to sort, 'options' is how to sort.
// 'options' is an object with optional properties:
//   'by_pattern': 'pattern'
//   'limit': [start, end]
//   'get_patterns': [ 'pattern', 'pattern', ... ]
//   'ascending': true|false
//   'lexicographically': true|false
//   'store_key': 'a_key_name'

Client.prototype.sort = function (key, options) {
  var promise = new process.Promise();
  var self = this;
  this.connect(function () {
    var opts = [];
    if (typeof(options) == 'object') {
      if (options.by_pattern) 
        opts.push('by ' + options.by_pattern);
      if (options.get_patterns) {
        options.get_patterns.forEach(function (pat) {
          opts.push('get ' + pat);
        });
      }
      if (!options.ascending)
        opts.push('desc');
      if (options.lexicographically)
        opts.push('alpha');
      if (options.store_key) 
        opts.push('store ' + options.store_key);
      if (options.limit)
        opts.push('limit ' + options.limit[0] + ' ' + options.limit[1]);
    } 
    var command = 'sort ' + key + ' ' + opts.join(' ') + crlf;
    write_debug("call:    client.sort(...)\ncommand: " + command);
    self.callbacks.push({ promise:promise, command:'sort' });
    self.conn.send(command);
  });
  return promise;
}

Client.prototype.quit = function () {
  if (this.conn.readyState != "open") {
    this.conn.close();
  } else {
    this.conn.send('quit' + crlf);
    this.conn.close();
  }
};

Client.prototype.make_master = function () {
  var self = this;
  this.connect(function () {
    self.callbacks.push({ promise:null, command:'slaveof' });
    self.conn.send('slaveof no one');
  });
};

Client.prototype.make_slave_of = function (host, port) {
  var self = this;
  this.connect(function () {
    port = port || 6379;
    var command = 'slaveof ' + host + ' ' + port;
    self.callbacks.push({ promise:null, command:'slaveof' });
    self.conn.send(command);
  });
};
