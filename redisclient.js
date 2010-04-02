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
    this.readBuffer = '';
    this.callbacks = [];
    this.channelCallbacks = {};
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

function BulkReply(length, value) {
    this.length = length;
    this.value = value;
}

BulkReply.prototype.toString = function () {
    if (this.length == 0 || this.value == null)
        return "$-1\r\n";

    return "$" + this.length + CRLF + this.value + CRLF;
};

function MultiBulkReply() {
    this.replies = [];
};

MultiBulkReply.prototype.addReply = function (reply) {
    this.replies.push(reply);
    return this;
};

MultiBulkReply.prototype.toString = function () {
    if (this.replies.length == 0) 
        return "*-1\r\n";

    var str = "*" + this.replies.length + CRLF;

    for (var i=0; i<this.replies.length; ++i) {
        var thisReply = this.replies[0];
        str += "$" + thisReply.length + CRLF + 
                     thisReply.toString() + CRLF;
    }

    return str;
};

function InlineReply(prefix, value) {
    this.prefix = prefix;
    this.value = value;
}

InlineReply.prototype.toString = function () {
    return this.prefix + this.value + CRLF;
};

function IntegerReply(value) { InlineReply.call(this, ':', value); };
function ErrorReply(value)   { InlineReply.call(this, '-', value); };

sys.inherits(IntegerReply, InlineReply);
sys.inherits(ErrorReply, InlineReply);

var nullReply = exports.nullReply = {isNull:true};
var partialReply = exports.partialReply = {partial:true};

exports.BulkReply = BulkReply;
exports.MultiBulkReply = MultiBulkReply;
exports.InlineReply = InlineReply;
exports.IntegerReply = IntegerReply;
exports.ErrorReply = ErrorReply;

var okReply = new InlineReply('+', 'OK');
var negativeOneReply = new IntegerReply(-1);
var zeroReply = new IntegerReply(0);
var oneReply = new IntegerReply(1);

Client.prototype.parseReply = function () {
    var reply;

    switch (this.readBuffer[0]) {
        case '$': reply = this.parseBulkReply();      break;
        case '*': reply = this.parseMultiBulkReply(); break;
        case '+': reply = this.parseInlineReply();    break;
        case ':': reply = this.parseIntegerReply();   break;
        case '-': reply = this.parseErrorReply();     break;
        default: 
            throw new Error("What is '" + this.readBuffer[0] + "'?");
    }

    return reply;
};

var qmarkRE = /\?/g;
var starRE  = /\*/g;
var dotRE   = /\./g;

function fnmatch (pattern, test) {
    var newPattern = pattern.replace(dotRE, '(\\.)')
                            .replace(qmarkRE, '(.)')
                            .replace(starRE, '(.*?)');
    return (new RegExp(newPattern)).test(test);
}

Client.prototype.handleReplies = function (chunk) {
    this.readBuffer += chunk;

    while (this.readBuffer.length > 0) {
        if (exports.debugMode) {
            sys.debug("");
            sys.debug("==================================================");
            sys.debug("read buffer: " + debugFilter(this.readBuffer.substring(0, 64)) + " ...");
        }

        var reply = this.parseReply();

        // Not a full reply in the buffer? Leave it alone.

        if (reply.partial) {
            if (exports.debugMode) 
                sys.debug("partial");
            break;
        }

        // Redis error reply?
            
        if (reply instanceof ErrorReply) {
            if (exports.debugMode) 
                sys.debug("error: " + reply.value);

            this.callbacks.shift()(error);
            continue;
        } 

        // PUBSUB published message?  
        // NB: 3 => [ "message","channel","payload" ]

        if (reply instanceof MultiBulkReply && 
            reply.replies.length == 3 && 
            reply.replies[0].value === 'message' &&
            Object.getOwnPropertyNames(this.channelCallbacks).length > 0) {

            var channelNameOrPattern = reply.replies[1].value;
            var channelCallback = this.channelCallbacks[channelNameOrPattern];

            if (typeof(channelCallback) == 'undefined') {
                // No 1:1 channel name match. 
                //
                // Perhaps the subscription was for a pattern (PSUBSCRIBE)?
                // Redis does not send the pattern that matched from an
                // original PSUBSCRIBE request.  It sends the (fn)matching
                // channel name instead.  Thus, let's try to fnmatch the
                // channel the message was published to/on to a subscribed
                // pattern, and callback the associated function.
                // 
                // A -> Redis     PSUBSCRIBE foo.*
                // B -> Redis     PUBLISH foo.bar hello
                // Redis -> A     MESSAGE foo.bar hello   (no pattern specified)

                var channelNamesOrPatterns = 
                    Object.getOwnPropertyNames(this.channelCallbacks);

                for (var i=0; i < channelNamesOrPatterns.length; ++i) {
                    var thisNameOrPattern = channelNamesOrPatterns[i];
                    if (fnmatch(thisNameOrPattern, channelNameOrPattern)) {
                        channelCallback = this.channelCallbacks[thisNameOrPattern];
                        break;
                    }
                }
            }

            if (typeof(channelCallback) === 'function') {
                // Good, we found a function to callback.

                var payload = reply.replies[2].value;
                channelCallback(channelNameOrPattern, payload);
            }

            continue;
        }

        // Non-PUBSUB reply (e.g. GET command reply).

        var callback = this.callbacks.shift();
        var processedReply = processReply(callback.commandName, reply);

        if (exports.debugMode) {
            sys.debug("reply: " + JSON.stringify(processedReply));
            sys.debug("from command: " + debugFilter(callback.commandBuffer));
        }

        callback(null, processedReply);   // null => no Redis error.
    }
};

Client.prototype.parseBulkReply = function () {
    var crlfIndex = this.readBuffer.indexOf(CRLF);
    if (crlfIndex == -1) 
        return partialReply;

    var bodyLength = parseInt(this.readBuffer.substring(1, crlfIndex), 10);

    if (bodyLength > 0) {
        var body;

        if (this.readBuffer.length - crlfIndex + CRLF_LEN < bodyLength)
            return partialReply;

        body = this.readBuffer.substr(crlfIndex + CRLF_LEN, bodyLength);

        var nextReplyIndex = crlfIndex + CRLF_LEN + bodyLength + CRLF_LEN;
        this.readBuffer = this.readBuffer.substring(nextReplyIndex);

        return new BulkReply(bodyLength, body);
    }

    this.readBuffer = this.readBuffer.substring(crlfIndex + CRLF_LEN);

    return nullReply;
};

Client.prototype.parseMultiBulkReply = function () {
    var crlfIndex = this.readBuffer.indexOf(CRLF);
    if (crlfIndex == -1) 
        return partialReply;

    var count = parseInt(this.readBuffer.substring(1, crlfIndex), 10);
    this.readBuffer = this.readBuffer.substring(crlfIndex + CRLF_LEN);
    if (count == -1) 
        return nullReply;

    var reply = new MultiBulkReply();
    if (count == 0)
        return reply;

    for (var i=0; i<count; ++i) {
        var thisReply = this.parseReply();

        // The read buffer might contain a partial multi-bulk reply but
        // we're removing the bulk reply parts from the front as we parse the
        // multi-bulk reply.  If a full multi-bulk reply is not present, we put
        // the partial multi-bulk reply back into the read buffer.

        if (thisReply.partial) {
            this.readBuffer = reply.toString() + this.readBuffer;
            return thisReply;
        }

        reply.addReply(thisReply);
    }

    return reply;
};

Client.prototype.parseInlineReply = function () {
    var crlfIndex = this.readBuffer.indexOf(CRLF);
    if (crlfIndex == -1) 
        return partialReply;

    var prefix = this.readBuffer[0];
    var body = this.readBuffer.substring(1, crlfIndex);
    this.readBuffer = this.readBuffer.substring(crlfIndex + CRLF_LEN);

    if (prefix == '+' && body == 'OK')      // optimize for common case
        return okReply;

    return new InlineReply(prefix, body);
};

Client.prototype.parseIntegerReply = function () {
    var crlfIndex = this.readBuffer.indexOf(CRLF);
    if (crlfIndex == -1) 
        return partialReply;

    var body = this.readBuffer.substring(1, crlfIndex);
    this.readBuffer = this.readBuffer.substring(crlfIndex + CRLF_LEN);
    var value = parseInt(body, 10);

    if (isNaN(value))
        throw new Error("Protocol error? NaN for integer");

    switch (value) {
        case -1: return negativeOneReply;
        case  0: return zeroReply;
        case  1: return oneReply;
    }

    return new IntegerReply(value);
};

Client.prototype.parseErrorReply = function () {
    var crlfIndex = this.readBuffer.indexOf(CRLF);
    if (crlfIndex == -1) 
        return partialReply;

    var body = this.readBuffer.substring(1, crlfIndex);
    this.readBuffer = this.readBuffer.substring(crlfIndex + CRLF_LEN);

    return new ErrorReply(body);
};

function maybeAsNumber(str) {
    var value = parseInt(str, 10);

    if (isNaN(value)) 
        value = parseFloat(str);

    if (isNaN(value)) 
        return str;

    return value;
}

function processReply(commandName, reply) {
    if (commandName === 'info' && reply instanceof BulkReply) {
        var info = {};
        reply.value.split(/\r\n/g).forEach(function (line) {
            var parts = line.split(':');
            if (parts.length === 2)
                info[parts[0]] = maybeAsNumber(parts[1]);
        });
        return info;
    }

    if (commandName === 'hgetall' && 
        (reply instanceof MultiBulkReply) &&
        reply.replies.length % 2 === 0) {

        var hash = {};
        for (var i=0; i<reply.replies.length; i += 2) 
            hash[reply.replies[i].value] = maybeAsNumber(reply.replies[i + 1].value);
        return hash;
    }

    if (commandName.match(/lastsave|([sz]card)|zscore/)) 
        return maybeAsNumber(reply.value);

    if (reply instanceof MultiBulkReply) {
        var values = [];
        for (var i=0; i<reply.replies.length; ++i)
            values.push(maybeAsNumber(reply.replies[i].value));
        return values;
    }

    if (reply instanceof InlineReply && reply.value === 'OK')
        return true;

    if (reply == nullReply)
        return null;

    return reply.value;
}

var commands = [ 
    "append",
    "auth",
    "bgsave",
    "blpop",
    "brpop",
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
    "unsubscribe",
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
        if (this.subscriptionMode && !commandName.match(/p?(un)?subscribe/)) 
            throw new Error("clients subscribed to >= 1 channels may " + 
                            "only call (p)subscribe/(p)unsubscribe.");

        var callback = null;
        var argCount = arguments.length;

        if (typeof(arguments[argCount - 1]) == 'function') {
            callback = arguments[argCount - 1];
            --argCount;
        } else {
            callback = function () {};
        }

        // All requests are formatted as multi-bulk.

        var buffer = "*" + (1 + argCount)            + CRLF +
                     "$" + commandName.length        + CRLF +
                           commandName.toUpperCase() + CRLF;

        for (var i=0; i < argCount; ++i) {
            var arg = arguments[i].toString();
            buffer += "$" + arg.length + CRLF + arg + CRLF;
        }

        if (callback) {
            callback.commandName = commandName;

            if (exports.debugMode) 
                callback.commandBuffer = buffer;
        }
        
        if (exports.debugMode)
            sys.debug("[SEND] " + debugFilter(buffer));

        // Will this work when we have expirations?
        this.callbacks.push(callback);

        if (this.stream.readyState == "open") 
            this.stream.write(buffer);
        else 
            throw new Error("disconnected");
    };
});

// Wraps 'subscribe' and 'psubscribe' methods to manage a single
// callback function per subscribed channel name/pattern.
//
// 'nameOrPattern' is a channel name like "hello" or a pattern like 
// "h*llo", "h?llo", or "h[ae]llo".
//
// 'callback' is a function that is called back with 2 args: 
// channel name/pattern and message payload.
//
// Note: You are not permitted to do anything but subscribe to 
// additional channels or unsubscribe from subscribed channels 
// when there are >= 1 subscriptions active.  Should you need to
// issue other commands, use a second client instance.

Client.prototype.subscribeTo = function (nameOrPattern, callback) {
    if (typeof(this.channelCallbacks[nameOrPattern]) === 'function')
        return;

    if (typeof(callback) !== 'function')
        throw new Error("requires a callback function");

    this.channelCallbacks[nameOrPattern] = callback;

    var method = nameOrPattern.match(/[\*\?\[]/) 
               ? "psubscribe" 
               : "subscribe";

    this[method](nameOrPattern);
};

Client.prototype.unsubscribeFrom = function (nameOrPattern) {
    if (typeof(this.channelCallbacks[nameOrPattern]) === 'undefined')
        return;

    delete this.channelCallbacks[nameOrPattern];

    var method = nameOrPattern.match(/[\*\?\[]/) 
               ? "punsubscribe" 
               : "unsubscribe";

    this[method](nameOrPattern);
};

