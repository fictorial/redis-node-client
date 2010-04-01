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
// bottom of this file.

// Set this to true to aid in debugging wire protocol input/output,
// parsing methods, etc.

exports.debugMode = false;

var tcp = require("tcp"),
    sys = require("sys");

var CRLF = "\r\n",
    CRLF_LEN = 2,
    MAX_RECONNECTION_ATTEMPTS = 10;

function Client(stream) {
    this.stream = stream;
    this.callbacks = [];
    this.readBuffer = '';
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
        client.attemptReconnects = !noReconnects;
    });

    stream.addListener("data", function (chunk) {
        if (exports.debugMode)
            sys.debug("[RECV] " + debugFilter(chunk));
        client.handleReplies(chunk);
    });

    stream.addListener("end", function () {
        if (stream.readyState && stream.readyState == "open")
            stream.close();
    });

    stream.addListener("close", function (inError) {
        if (client.attemptReconnects && 
            client.reconnectionAttempts++ < MAX_RECONNECTION_ATTEMPTS) {
            stream.setTimeout(10);
            stream.connect(port, host);
        }
    });

    return client;
};

Client.prototype.close = function () {
    this.attemptReconnects = false;
    this.stream.close();
};

function debugFilter(what) {
    var filtered = what;

    filtered = filtered.replace(/\r\n/g, '<CRLF>');
    filtered = filtered.replace(/\r/g, '<CR>');
    filtered = filtered.replace(/\n/g, '<LF>');

    return filtered;
}

Client.prototype.writeCommand = function (formattedRequest, responseCallback) {
    if (exports.debugMode)
        sys.debug("[SEND] " + debugFilter(formattedRequest));

    this.callbacks.push(responseCallback);

    if (this.stream.readyState == "open") 
        this.stream.write(formattedRequest);
    else 
        throw new Error("disconnected");
};

Client.prototype.handleReplies = function (chunk) {
    this.readBuffer += chunk;

    while (this.readBuffer.length > 0) {

        // Do not shift the first callback off yet until we know
        // there's a full reply in the read buffer.

        var callback = this.callbacks[0];  

        if (exports.debugMode) {
            sys.debug("==================================================");
            sys.debug("from command: " + debugFilter(callback.commandBuffer));
            sys.debug("recv buffer: " + debugFilter(this.readBuffer.substring(0, 40)) + " ...");
        }

        var reply, error;

        switch (this.readBuffer[0]) {
            case '$': reply = this.parseBulkReply();      break;
            case '*': reply = this.parseMultiBulkReply(); break;
            case '+': reply = this.parseInlineReply();    break;
            case ':': reply = this.parseIntegerReply();   break;
            case '-': error = this.parseErrorReply();     break;
            default: throw new Error("What is '" + this.readBuffer[0] + "'?");
        }

        if (!(reply instanceof PartialReply)) {
            // Some full reply or error was read from the reply buffer.

            if (reply != null) {
                var processedReply = processReply(callback.commandName, reply);

                if (exports.debugMode) 
                    sys.debug("reply: " + JSON.stringify(processedReply));

                callback(null, processedReply);
            } else if (error != null) {
                if (exports.debugMode) {
                    sys.debug("error: " + JSON.stringify(error));
                    sys.debug("callback = " + callback);
                }

                callback(error, null);
            } 

            this.callbacks.shift();
        }
    }
};

function PartialReply() {}
exports.PartialReply = PartialReply;

Client.prototype.parseBulkReply = function () {
    var crlfIndex = this.readBuffer.indexOf(CRLF);
    if (crlfIndex == -1) return new PartialReply();

    var replyLength = parseInt(this.readBuffer.substring(1, crlfIndex), 10);

    if (replyLength > 0) {
        var reply;
        if (this.readBuffer.length - crlfIndex + CRLF_LEN < replyLength)
            return new PartialReply();
        reply = this.readBuffer.substr(crlfIndex + CRLF_LEN, replyLength);
        var nextReplyIndex = crlfIndex + CRLF_LEN + replyLength + CRLF_LEN;
        this.readBuffer = this.readBuffer.substring(nextReplyIndex);
        return reply;
    }

    this.readBuffer = this.readBuffer.substring(crlfIndex + CRLF_LEN);
    return null;
};

Client.prototype.parseMultiBulkReply = function () {
    var crlfIndex = this.readBuffer.indexOf(CRLF);
    if (crlfIndex == -1) return new PartialReply();

    var count = parseInt(this.readBuffer.substring(1, crlfIndex), 10);
    this.readBuffer = this.readBuffer.substring(crlfIndex + CRLF_LEN);
    if (count <= 0) return null;   // empty/missing/none

    var replyParts = [];
    for (var i=0; i<count; ++i) {
        var part = this.parseBulkReply();

        // The receive buffer might contain a partial multi-bulk reply but
        // we're removing the bulk reply parts from the front as we parse the
        // multi-bulk reply.  If a full multi-bulk reply is not present, we put
        // the partial multi-bulk reply back into the receive buffer.

        if (part instanceof PartialReply) {
            var origReply = "*" + count + CRLF;
            for (var i=0; i<replyParts.length; ++i) {
                var origValue = replyParts[i].toString();
                origReply += "$" + origValue.length + CRLF + origValue + CRLF;
            }
            this.readBuffer = origReply + this.readBuffer;
            return new PartialReply();
        }

        replyParts.push(part);
    }

    return replyParts;
};

Client.prototype.parseInlineReply = function () {
    var crlfIndex = this.readBuffer.indexOf(CRLF);
    if (crlfIndex == -1) return new PartialReply();
    var reply = this.readBuffer.substring(1, crlfIndex);
    this.readBuffer = this.readBuffer.substring(crlfIndex + CRLF_LEN);
    return reply === 'OK' ? true : reply;
};

Client.prototype.parseIntegerReply = function () {
    var crlfIndex = this.readBuffer.indexOf(CRLF);
    if (crlfIndex == -1) return new PartialReply();
    var reply = parseInt(this.readBuffer.substring(1, crlfIndex), 10);
    this.readBuffer = this.readBuffer.substring(crlfIndex + CRLF_LEN);
    return reply;
};

Client.prototype.parseErrorReply = function () {
    var crlfIndex = this.readBuffer.indexOf(CRLF);
    if (crlfIndex == -1) return new PartialReply();
    var reply = this.readBuffer.substring(1, crlfIndex);
    this.readBuffer = this.readBuffer.substring(crlfIndex + CRLF_LEN);
    return reply;
};

function maybeAsNumber(str) {
    var value = parseInt(str, 10);
    if (isNaN(value)) value = parseFloat(str);
    if (isNaN(value)) return str;
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

    if (commandName.match(/lastsave|([sz]card)|zscore/)) 
        return maybeAsNumber(reply);

    return reply;
}

var commands = [ 
    "append",
    "auth",
    "bgsave",
    "blpop",
    "brpoplpush",
    "dbsize",
    "decr",
    "decrby",
    "del",
    "exists",
    "expire",
    "expireat",
    "flushall",
    "flushdb",
    "get",
    "getset",
    "hdel",
    "hexists",
    "hget",
    "hgetall",
    "hincrby",
    "hkeys",
    "hlen",
    "hmget",
    "hmset",
    "hset",
    "hvals",
    "incr",
    "incrby",
    "info",
    "keys",
    "lastsave",
    "len",
    "lindex",
    "llen",
    "lpop",
    "lpush",
    "lrange",
    "lrem",
    "lset",
    "ltrim",
    "mget",
    "move",
    "mset",
    "msetnx",
    "psubscribe",
    "publish",
    "punsubscribe",
    "randomkey",
    "rename",
    "renamenx",
    "rpop",
    "rpoplpush",
    "rpush",
    "sadd",
    "save",
    "scard",
    "sdiff",
    "sdiffstore",
    "select",
    "set",
    "setnx",
    "shutdown",
    "sinter",
    "sinterstore",
    "sismember",
    "smembers",
    "smove",
    "sort",
    "spop",
    "srandmember",
    "srem",
    "subscribe",
    "sunion",
    "sunionstore",
    "ttl",
    "type",
    "unsubcribe",
    "zadd",
    "zcard",
    "zcount",
    "zincrby",
    "zinter",
    "zrange",
    "zrangebyscore",
    "zrank",
    "zrem",
    "zrembyrank",
    "zremrangebyrank",
    "zremrangebyscore",
    "zrevrange",
    "zrevrank",
    "zscore",
    "zunion",
];

commands.forEach(function (commandName) {
    Client.prototype[commandName] = function () {
        var callback = null;
        var argCount = arguments.length;

        if (typeof(arguments[argCount - 1]) == 'function') {
            callback = arguments[argCount - 1];
            argCount--;
        } else 
            callback = function () {};

        var buffer = "*" + (1 + argCount) + CRLF +
                     "$" + commandName.length + CRLF +
                     commandName.toUpperCase() + CRLF;

        for (var i=0; i < argCount; ++i) {
            var arg = arguments[i].toString();
            buffer += "$" + arg.length + CRLF + arg + CRLF;
        }

        if (callback) {
            callback.commandName = commandName;
            if (exports.debugMode) callback.commandBuffer = buffer;
        }
        
        return this.writeCommand(buffer, callback);
    };
});

