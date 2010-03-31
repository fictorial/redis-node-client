/*
    Redis client module for Node.js

    Copyright (C) 2010 Fictorial LLC.

    Permission is hereby granted, free of charge, to any person obtaining
    a copy of this software and associated documentation files (the
    "Software"), to deal in the Software without restriction, including without
    limitation the rights to use, copy, modify, merge, publish, distribute,
    sublicense, and/or sell copies of the Software, and to permit persons to
    whom the Software is furnished to do so, subject to the following
    conditions:

    The above copyright notice and this permission notice shall be included in
    all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
    FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
    DEALINGS IN THE SOFTWARE.
*/

// To add support for new commands, edit the array called "commands" at the
// bottom of file.

var tcp = require("tcp"),
    sys = require("sys");

var CRLF = "\r\n",
    CRLF_LEN = 2,
    MAX_RECONNECTION_ATTEMPTS = 10;

function Client(stream) {
    this.stream = stream;
    this.callbacks = [];
    this.replies = '';
}

exports.createClient = function (port, host, noReconnects) {
    port = port || 6379;
    host = host || '127.0.0.1';

    var stream = new tcp.createConnection(port, host);
    var client = new Client(stream);

    stream.addListener("connect", function () {
        stream.setEncoding('binary');
        stream.setNoDelay();
        stream.setTimeout(0);

        client.reconnectionAttempts = 0;
    });

    stream.addListener("data", function (chunk) {
        sys.puts("<-- " + debugFilter(chunk));

        client.handleReplies(chunk);
    });

    stream.addListener("end", function () {
        if (stream.readyState && stream.readyState == "open")
            stream.close();
    });

    stream.addListener("close", function (inError) {
        if (!noReconnects && 
            client.reconnectionAttempts++ < MAX_RECONNECTION_ATTEMPTS) {
            stream.setTimeout(10);
            stream.connect(port, host);
        }
    });

    return client;
};

function debugFilter(what) {
    return what.replace(/\r\n/g, '<CRLF>');
}

Client.prototype.writeCommand = function (formattedRequest, responseCallback) {
    sys.puts("--> " + debugFilter(formattedRequest));

    this.callbacks.push(responseCallback);

    if (this.stream.readyState == "open") 
        this.stream.write(formattedRequest);
};

// 'key' is what to sort, 'options' is how to sort.
// 'options' is an object with optional properties:
//   'byPattern': 'pattern'
//   'limit': [start, end]
//   'getPatterns': [ 'pattern', 'pattern', ... ]
//   'ascending': true|false
//   'lexicographically': true|false
//   'storeKey': 'aKeyName'

Client.prototype.sort = function (key, options, callback) {
    var opts = [];

    if (typeof(options) == 'object') {
        if (options.byPattern) 
            opts.push('by ' + options.byPattern);

        if (options.getPatterns) {
            options.getPatterns.forEach(function (pat) {
                opts.push('get ' + pat);
            });
        }

        if (!options.ascending)
            opts.push('desc');

        if (options.lexicographically)
            opts.push('alpha');

        if (options.storeKey) 
            opts.push('store ' + options.storeKey);

        if (options.limit)
            opts.push('limit ' + options.limit[0] + ' ' + options.limit[1]);
    } 

    var buffer = 'sort ' + key + ' ' + opts.join(' ') + CRLF;

    return this.writeCommand(buffer, callback);
};

Client.prototype.handleReplies = function (chunk) {
    this.replies += chunk;

    while (this.replies.length > 0) {
        var reply, error;

        switch (this.replies[0]) {
            case '$': reply = this.parseBulkReply();      break;
            case '*': reply = this.parseMultiBulkReply(); break;
            case '+': reply = this.parseInlineReply();    break;
            case ':': reply = this.parseIntegerReply();   break;
            case '-': error = this.parseErrorReply();     break;
            default: 
                throw new Error("'" + this.replies[0] + "'");
        }

        if (this.callbacks.length > 0) {
            var callback = this.callbacks.shift();

            if (reply)      
                callback(null, processReply(callback.commandName, reply));
            else if (error) 
                callback(error, null);
        }
    }
};

Client.prototype.parseBulkReply = function () {
    var crlfIndex = this.replies.indexOf(CRLF);
    if (crlfIndex == -1) 
        return null;

    var replyLength = parseInt(this.replies.substr(1, crlfIndex), 10);
    if (this.replies.length - crlfIndex + CRLF_LEN < replyLength) 
        return null;

    var reply = this.replies.substr(crlfIndex + CRLF_LEN, replyLength);
    this.replies = this.replies.substr(crlfIndex + CRLF_LEN + 
        replyLength + CRLF_LEN);

    return reply;
};

Client.prototype.parseMultiBulkReply = function () {
    var crlfIndex = this.replies.indexOf(CRLF);
    if (crlfIndex == -1) 
        return null;

    var count = parseInt(this.replies.substr(1, crlfIndex), 10);
    this.replies = this.replies.substr(crlfIndex + CRLF_LEN);

    var replyParts = [];
    for (var i=0; i<count; ++i)
        replyParts.push(this.parseBulkReply());
    return replyParts;
};

Client.prototype.parseInlineReply = function () {
    var crlfIndex = this.replies.indexOf(CRLF);
    if (crlfIndex == -1) 
        return null;

    var reply = this.replies.substr(1, crlfIndex);
    this.replies = this.replies.substr(crlfIndex + CRLF_LEN);
    return reply === 'OK' ? true : reply;
};

Client.prototype.parseIntegerReply = function () {
    var crlfIndex = this.replies.indexOf(CRLF);
    if (crlfIndex == -1) 
        return null;

    var reply = parseInt(this.replies.substr(1, crlfIndex), 10);
    this.replies = this.replies.substr(crlfIndex + CRLF_LEN);
    return reply;
};

Client.prototype.parseErrorReply = function () {
    var crlfIndex = this.replies.indexOf(CRLF);
    if (crlfIndex == -1) 
        return null;

    var reply = this.replies.substr(1, crlfIndex);
    this.replies = this.replies.substr(crlfIndex + CRLF_LEN);
    return reply;
};

function maybeAsNumber(str) {
  var value = parseInt(str, 10);

  if (value === NaN) 
    value = parseFloat(str);

  if (value === NaN) 
    return str;

  return value;
}

function processReply(commandName, reply) {
    if (commandName === 'info') {
        var info = {};

        reply.split(/\r\n/g).forEach(function (line) {
            var parts = line.split(':');
            if (parts.length === 2)
                info[parts[0]] = maybeAsNumber(parts[1]);
        });

        return info;
    }

    if (commandName == 'hgetall' && reply.length % 2 == 0) {
        var hash = {};

        for (var i=0; i<reply.length; i += 2) 
            hash[reply[i]] = reply[i + 1];

        return hash;
    }

    if (commandName === 'keys') 
        return reply.split(' ');

    if (commandName.match(/lastsave|([sz]card)|zscore/)) 
        return maybeAsNumber(reply);

    return reply;
}

var commands = [ 
    "append", "auth", "bgsave", "blpop", "brpoplpush", "dbsize", "decr",
    "decrby", "del", "exists", "expire", "flushall", "flushdb", "get",
    "getbit", "getset", "hdel", "hexists", "hget", "hgetall", "hincrby",
    "hkeys", "hlen", "hmget", "hmset", "hset", "hvals", "incr", "incrby",
    "info", "keys", "lastsave", "len", "lindex", "llen", "lpop", "lpush",
    "lrange", "lrem", "lset", "ltrim", "mget", "move", "mset", "msetnx",
    "peek", "poke", "randomkey", "rename", "renamenx", "rpop", "rpoplpush",
    "rpush", "sadd", "save", "scard", "sdiff", "sdiffstore", "select", "set",
    "setbit", "setnx", "shutdown", "sinter", "sinterstore", "sismember",
    "smembers", "smove", "spop", "srandmember", "srem", "substr", "sunion",
    "sunionstore", "ttl", "type", "zadd", "zcard", "zcount", "zinter",
    "zrange", "zrangebyscore", "zrank", "zrem", "zrembyrank", "zrevrange",
    "zrevrank", "zscore", "zunion"
];

commands.forEach(function (commandName) {
    Client.prototype[commandName] = function () {
        var callback = arguments.length > 0 
                     ? arguments[arguments.length - 1] 
                     : null;

        var argCount = callback 
                     ? arguments.length - 1 
                     : arguments.length;

        var buffer = "*" + arguments.length + CRLF +
                     "$" + commandName.length + CRLF +
                     commandName + CRLF;

        for (var i=0; i < argCount; ++i) {
            var arg = arguments[i].toString();
            buffer += "$" + arg.length + CRLF + arg + CRLF;
        }

        if (callback)
            callback.commandName = commandName;
        
        return this.writeCommand(buffer, callback);
    };
});

