/*
    Redis client for Node.js -- tests

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

// http://github.com/fictorial/redis-node-client
// Brian Hammond <brian at fictorial dot com>

// NOTE: this test suite uses databases 14 and 15 for test purposes! 
// Make sure your Redis instance has at least this many databases; the default has 16.
// These databases will be flushed these databases at the start of each test run. 
// If you want to use a different database number, update TEST_DB_NUMBER* below.

// NOTE: each test is responsible for configuring the dataset needed to 
// run that test.  There are no "fixtures" or similar.

var TEST_DB_NUMBER = 15,
    TEST_DB_NUMBER_FOR_MOVE = 14;

var sys = require("sys"),
    assert = require("assert"),
    redisclient = require("./redisclient");

redisclient.debugMode = true;

function showContext(context) {
    sys.debug("");
    sys.debug("VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV");
    sys.debug(context + " FAILED!");
    sys.debug("^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^");
    sys.debug("");
}

// These wrappers around the assert module exist because we generate functions
// to test for expected conditions which lose context, and assert's functions
// use the 'message' in place of the failed condition.

function checkEqual(actual, expected, context) {
    try {
        assert.equal(actual, expected);
    } catch (e) {
        showContext(context);
        throw e;
    }
}

function check(what, context) {
    try {
        assert.ok(what);
    } catch (e) {
        showContext(context);
        throw e;
    }
}

function checkDeepEqual(actual, expected, context) {
    try {
        assert.deepEqual(actual, expected);
    } catch (e) {
        showContext(context);
        throw e;
    }
}

// Redis' protocol returns +OK for some operations to mean "true" or "success".
// The client converts this into a boolean with value true.

function expectOK(context) {
    return function (err, truthiness) {
        if (err) assert.fail(err, context);
        checkEqual(typeof(truthiness), 'boolean', context);
        checkEqual(truthiness, true, context);
    };
}

function maybeAsNumber(str) {
    var value = parseInt(str, 10);

    if (isNaN(value)) 
        value = parseFloat(str);

    if (isNaN(value)) 
        return str;

    return value;
}

function expectNumber(expectedValue, context) {
    return function (err, reply) {
        if (err) assert.fail(err, context);
        var value = maybeAsNumber(reply);
        checkEqual(value, expectedValue, context);
    };
}

function clearTestDatabasesBeforeEachTest() {
    client.select(TEST_DB_NUMBER_FOR_MOVE, expectOK("select"));
    client.flushdb(expectOK("flushdb"));

    client.select(TEST_DB_NUMBER, expectOK("select"));
    client.flushdb(expectOK("flushdb"));
}

function testParseBulkReply() {
    var a = "$6\r\nFOOBAR\r\n";
    client.readBuffer = a;
    var reply = client.parseBulkReply();
    checkEqual(reply.value, "FOOBAR", "testParseBulkReply");

    var b = "$-1\r\n";
    client.readBuffer = b;
    reply = client.parseBulkReply();
    checkDeepEqual(reply, redisclient.nullReply, "testParseBulkReply");

    var c = "$-1\r";     // NB: partial command, missing \n
    client.readBuffer = c;
    reply = client.parseBulkReply();
    checkDeepEqual(reply, redisclient.partialReply, "testParseBulkReply");
}

function testParseMultiBulkReply() {
    var a = "*4\r\n$3\r\nFOO\r\n$3\r\nBAR\r\n$5\r\nHELLO\r\n$5\r\nWORLD\r\n";
    client.readBuffer = a;
    var reply = client.parseMultiBulkReply();
    check(reply instanceof redisclient.MultiBulkReply, "testParseMultiBulkReply 0");
    checkEqual(reply.replies.length, 4, "testParseMultiBulkReply a-1");
    check(reply.replies[0] instanceof redisclient.BulkReply, "testParseMultiBulkReply a-2");
    check(reply.replies[1] instanceof redisclient.BulkReply, "testParseMultiBulkReply a-3");
    check(reply.replies[2] instanceof redisclient.BulkReply, "testParseMultiBulkReply a-4");
    check(reply.replies[3] instanceof redisclient.BulkReply, "testParseMultiBulkReply a-5");
    checkEqual(reply.replies[0].value, 'FOO', "testParseMultiBulkReply a-6");
    checkEqual(reply.replies[1].value, 'BAR', "testParseMultiBulkReply a-7");
    checkEqual(reply.replies[2].value, 'HELLO', "testParseMultiBulkReply a-8");
    checkEqual(reply.replies[3].value, 'WORLD', "testParseMultiBulkReply a-9");

    var b = "$-1\r\n";
    client.readBuffer = b;
    reply = client.parseMultiBulkReply();
    checkDeepEqual(reply, redisclient.nullReply, "testParseMultiBulkReply b-1");

    var c = "*3\r\n$3\r\nFOO\r\n$-1\r\n$4\r\nBARZ\r\n";
    client.readBuffer = c;
    reply = client.parseMultiBulkReply();
    check(reply instanceof redisclient.MultiBulkReply, "testParseMultiBulkReply c-0");
    checkEqual(reply.replies.length, 3, "testParseMultiBulkReply c-1");
    check(reply.replies[0] instanceof redisclient.BulkReply, "testParseMultiBulkReply c-2");
    checkEqual(reply.replies[1], redisclient.nullReply, "testParseMultiBulkReply c-3");
    check(reply.replies[2] instanceof redisclient.BulkReply, "testParseMultiBulkReply c-4");
    checkEqual(reply.replies[0].value, 'FOO', "testParseMultiBulkReply c-5");
    checkEqual(reply.replies[2].value, 'BARZ', "testParseMultiBulkReply c-6");

    // Test with a multi-bulk reply containing a subreply that's non-bulk
    // but an inline/integer reply instead.

    var d = "*3\r\n$9\r\nsubscribe\r\n$6\r\n#redis\r\n:1\r\n";
    client.readBuffer = d;
    reply = client.parseMultiBulkReply();
    check(reply instanceof redisclient.MultiBulkReply);
    checkEqual(reply.replies.length, 3, "testParseMultiBulkReply d-0");
    check(reply.replies[0] instanceof redisclient.BulkReply, "testParseMultiBulkReply d-1");
    check(reply.replies[1] instanceof redisclient.BulkReply, "testParseMultiBulkReply d-2");
    check(reply.replies[2] instanceof redisclient.IntegerReply, "testParseMultiBulkReply d-3");
    checkEqual(reply.replies[0].value, 'subscribe', "testParseMultiBulkReply d-4");
    checkEqual(reply.replies[1].value, '#redis', "testParseMultiBulkReply d-5");
    checkEqual(reply.replies[2].value, 1, "testParseMultiBulkReply d-6");

    var e = "*0\r\n";
    client.readBuffer = e;
    reply = client.parseMultiBulkReply();
    check(reply instanceof redisclient.MultiBulkReply, "testParseMultiBulkReply e-0");
    checkEqual(reply.replies.length, 0, "testParseMultiBulkReply e-1");
}

function testParseInlineReply() {
    var a = "+OK\r\n";
    client.readBuffer = a;
    var reply = client.parseInlineReply();
    check(reply instanceof redisclient.InlineReply, "testParseInlineReply");
    checkEqual(typeof(reply.value), 'string', "testParseInlineReply");
    checkEqual(reply.value, "OK", "testParseInlineReply");

    var b = "+WHATEVER\r\n";
    client.readBuffer = b;
    reply = client.parseInlineReply();
    check(reply instanceof redisclient.InlineReply, "testParseInlineReply");
    checkEqual(typeof(reply.value), 'string', "testParseInlineReply");
    checkEqual(reply.value, 'WHATEVER', "testParseInlineReply");
}

function testParseIntegerReply() {
    var a = ":-1\r\n";
    client.readBuffer = a;
    var reply = client.parseIntegerReply();
    check(reply instanceof redisclient.IntegerReply, "testParseIntegerReply");
    checkEqual(typeof(reply.value), 'number', "testParseIntegerReply");
    checkEqual(reply.value, -1, "testParseIntegerReply");

    var b = ":1000\r\n";
    client.readBuffer = b;
    reply = client.parseIntegerReply();
    check(reply instanceof redisclient.IntegerReply, "testParseIntegerReply");
    checkEqual(typeof(reply.value), 'number', "testParseIntegerReply");
    checkEqual(reply.value, 1000, "testParseIntegerReply");
}

function testParseErrorReply() {
    var a = "-ERR solar flare\r\n";
    client.readBuffer = a;
    var reply = client.parseErrorReply();
    checkEqual(typeof(reply.value), 'string', "testParseErrorReply");
    checkEqual(reply.value, "ERR solar flare", "testParseErrorReply");

    var b = "-hiccup\r\n";
    client.readBuffer = b;
    reply = client.parseErrorReply();
    check(reply instanceof redisclient.ErrorReply, "testParseErrorReply");
    checkEqual(typeof(reply.value), 'string', "testParseErrorReply");
    checkEqual(reply.value, "hiccup", "testParseErrorReply");
}

function testAUTH() {
    // You need to configure redis to enable auth.
    // This unit test suite assumes the auth feature is off/disabled.
    // Auth *would be* the first command required after connecting.

    sys.debug("This test does not do anything.");
}

function testSELECT() {
    sys.debug("This test does not do anything.");
}

function testFLUSHDB() {
    // no-op; tested in testSelect

    sys.debug("This test does not do anything.");
}

function testSET() {
    client.set('foo', 'bar', expectOK("testSET"));
    client.set('baz', 'buz', expectOK("testSET"));
    client.set('ggg', '123', expectOK("testSET"));
    client.set('ggg', 123, expectOK("testSET"));    // number
}

function testSETNX() {
    client.set('foo', 'bar', expectOK("testSETNX"));
    client.setnx('foo', 'quux', expectNumber(0, "testSETNX"));    // fails when already set
    client.setnx('boo', 'apple', expectNumber(1, "testSETNX"));   // no such key already so OK
}

function testGET() {
    client.set('foo', 'bar', expectOK("testGET"));
    client.set('baz', 'buz', expectOK("testGET"));

    client.get('foo', function (err, value) {
        if (err) assert.fail(err, "testGET");
        checkEqual(value, 'bar', "testGET");
    });

    client.get('baz', function (err, value) {
        if (err) assert.fail(err, "testGET");
        checkEqual(value, 'buz', "testGET");
    });
}

function testMGET() {
    client.set('foo', 'bar', expectOK("testMGET"));
    client.set('baz', 'buz', expectOK("testMGET"));

    client.mget('foo', 'baz', function (err, values) {
        if (err) assert.fail(err, "testMGET");
        checkEqual(values[0], 'bar', "testMGET");
        checkEqual(values[1], 'buz', "testMGET");
    });
}

function testGETSET() {
    client.set('getsetfoo', 'getsetbar', expectOK("testGETSET 0"));

    client.getset('getsetfoo', 'fuzz', function (err, previousValue) {
        if (err) assert.fail(err, "testGETSET 1");
        checkEqual(previousValue, 'getsetbar', "testGETSET 2");
    });

    client.get('getsetfoo', function (err, value) {
        if (err) assert.fail(err, "testGETSET 3");
        checkEqual(value, 'fuzz', "testGETSET 4");
    });
}

function testSETANDGETMULTIBYTE() {
    var testValue = unescape('%F6');
    client.set('unicode', testValue, expectOK("testSETANDGETMULTIBYTE"))

    client.get('unicode', function (err, value) {
        if (err) assert.fail(err, "testSETANDGETMULTIBYTE");
        checkEqual(value, testValue, "testSETANDGETMULTIBYTE");
    });
}

function testINFO() {
    client.info( function (err, info) {
        check(info instanceof Object, "testINFO");
        check(info.hasOwnProperty('redis_version'), "testINFO");
        check(info.hasOwnProperty('connected_clients'), "testINFO");
        check(info.hasOwnProperty('uptime_in_seconds'), "testINFO");
        checkEqual(typeof(info.uptime_in_seconds), 'number', "testINFO");
        checkEqual(typeof(info.connected_clients), 'number', "testINFO");
    });
}

function testINCR() {
    client.incr('counter', expectNumber(1, "testINCR"))
    client.incr('counter', expectNumber(2, "testINCR"))
}

function testINCRBY() {
    client.incrby('counter', '2', expectNumber(2, "testINCRBY"))
    client.incrby('counter', '-1', expectNumber(1, "testINCRBY"))
}

function testDECR() {
    client.decr('counter', expectNumber(-1, "tetDECR"))
    client.decr('counter', expectNumber(-2, "tetDECR"))
}

function testDECRBY() {
    client.decrby('counter', '1', expectNumber(-1, "testDECRBY"))
    client.decrby('counter', '2', expectNumber(-3, "testDECRBY"))
    client.decrby('counter', '-3', expectNumber(0, "testDECRBY"))
}

function testEXISTS() {
    client.set('foo', 'bar', expectOK("testEXISTS"));
    client.exists('foo', expectNumber(1, "testEXISTS"))
    client.exists('foo2', expectNumber(0, "testEXISTS"))
}

function testDEL() {
    client.set('goo', 'bar', expectOK("testDEL"));
    client.del('goo', expectNumber(1, "testDEL"));
    client.exists('goo', expectNumber(0, "testDEL"));
    client.del('goo', expectNumber(0, "testDEL"));
}

function testKEYS() {
    client.set('foo1', 'foo1Value', expectOK("testKEYS"))
    client.set('foo2', 'foo2Value', expectOK("testKEYS"))

    client.keys('foo*', function (err, keys) {
        if (err) assert.fail(err, "testKEYS");
        checkEqual(keys.length, 2, "testKEYS");
        checkDeepEqual(keys.sort(), ['foo1', 'foo2'], "testKEYS");
    });

    client.set('baz', 'bazValue', expectOK("testKEYS"))
    client.set('boo', 'booValue', expectOK("testKEYS"))

    // At this point we have foo1, foo2, baz, boo

    client.keys('*', function (err, keys) {
        if (err) assert.fail(err, "testKEYS");
        checkEqual(keys.length, 4, "testKEYS");
        checkDeepEqual(keys.sort(), ['baz', 'boo', 'foo1', 'foo2'], "testKEYS");
    });

    client.keys('?oo', function (err, keys) {
        if (err) assert.fail(err, "testKEYS");
        checkEqual(keys.length, 1, "testKEYS");
        checkDeepEqual(keys.sort(), ['boo'], "testKEYS");
    });
}

function testRANDOMKEY() {
    client.set('foo', 'bar', expectOK("testRANDOMKEY"));
    client.set('baz', 'buz', expectOK("testRANDOMKEY"));

    client.randomkey(function (err, someKey) {
        if (err) assert.fail(err, "testRANDOMKEY");
        check(/^(foo|baz)$/.test(someKey), "testRANDOMKEY");
    });
}

function testRENAME() {
    client.set('foo', 'bar', expectOK("testRENAME"));
    client.rename('foo', 'zoo', expectOK("testRENAME"));
    client.exists('foo', expectNumber(0, "testRENAME"));
    client.exists('zoo', expectNumber(1, "testRENAME"));
}

function testRENAMENX() {
    client.set('roo', 'bar', expectOK("testRENAMENX"));
    client.set('bar', 'baz', expectOK("testRENAMENX"));
    client.renamenx('roo', 'bar', expectNumber(0, "testRENAMENX"));   // bar already exists
    client.exists('roo', expectNumber(1, "testRENAMENX"));            // was not renamed
    client.exists('bar', expectNumber(1, "testRENAMENX"));            // was not touched
    client.renamenx('roo', 'too', expectNumber(1, "testRENAMENX"));   // too did not exist... OK
    client.exists('roo', expectNumber(0, "testRENAMENX"));            // was renamed
    client.exists('too', expectNumber(1, "testRENAMENX"));            // was created
}

function testDBSIZE() {
    client.set('foo', 'bar', expectOK("testDBSIZE"));
    client.set('bar', 'baz', expectOK("testDBSIZE"));

    client.dbsize(function (err, value) {
        if (err) assert.fail(err, "testDBSIZE");
        checkEqual(value, 2, "testDBSIZE");
    });
}

function testEXPIRE() {
    // set 'expfoo' to expire in 2 seconds

    client.set('expfoo', 'bar', expectOK("testEXPIRE"));
    client.expire('expfoo', 2, expectNumber(1, "testEXPIRE"));

    // subsequent expirations cannot be set.

    client.expire('expfoo', 2, expectNumber(0, "testEXPIRE"));

    setTimeout(function () {
        client.exists('expfoo', expectNumber(0, "testEXPIRE"));
    }, 2500);
}

function testTTL() {
    client.set('ttlfoo', 'bar', expectOK("testTTL"));

    // ttlfoo is not set to expire

    client.ttl('ttlfoo', function (err, value) {
        if (err) assert.fail(err, "testTTL");
        checkEqual(value, -1, "testTTL");
    });

    client.set('ttlbar', 'baz', expectOK("testTTL"));
    client.expire('ttlbar', 3, expectNumber(1, "testTTL"));

    client.ttl('ttlbar', function (err, value) {
        if (err) assert.fail(err, "testTTL");
        check(value > 0, "testTTL");
    });
}

function testRPUSH() {
    client.rpush('list0', 'list0value0', expectNumber(1, "testRPUSH"));
    client.exists('list0', expectNumber(1, "testRPUSH"));
}

function testLPUSH() {
    client.exists('list1', expectNumber(0, "testLPUSH"));
    client.lpush('list1', 'list1value0', expectNumber(1, "testLPUSH"));
    client.exists('list1', expectNumber(1, "testLPUSH"));
}

function testLLEN() {
    client.rpush('list0', 'list0value0', expectNumber(1, "testLLEN"));
    client.llen('list0', expectNumber(1, "testLLEN"));

    client.rpush('list0', 'list0value1', expectNumber(2, "testLLEN"));
    client.llen('list0', expectNumber(2, "testLLEN"));
}

function testLRANGE() {
    client.rpush('list0', 'list0value0', expectNumber(1, "testLRANGE"));
    client.rpush('list0', 'list0value1', expectNumber(2, "testLRANGE"));

    client.lrange('list0', 0, -1, function (err, values) {
        if (err) assert.fail(err, "testLRANGE");
        checkEqual(values.length, 2, "testLRANGE");
        checkEqual(values[0], 'list0value0', "testLRANGE");
        checkEqual(values[1], 'list0value1', "testLRANGE");
    });

    client.lrange('list0', 0, 0, function (err, values) {
        if (err) assert.fail(err, "testLRANGE");
        checkEqual(values.length, 1, "testLRANGE");
        checkEqual(values[0], 'list0value0', "testLRANGE");
    });

    client.lrange('list0', -1, -1, function (err, values) {
        if (err) assert.fail(err, "testLRANGE");
        checkEqual(values.length, 1, "testLRANGE");
        checkEqual(values[0], 'list0value1', "testLRANGE");
    });
}

function testLTRIM() {
    client.rpush('list0', 'list0value0', expectNumber(1, "testLTRIM"));
    client.rpush('list0', 'list0value1', expectNumber(2, "testLTRIM"));
    client.rpush('list0', 'list0value2', expectNumber(3, "testLTRIM"));

    client.llen('list0', function (err, len) {
        if (err) assert.fail(err, "testLTRIM");
        checkEqual(len, 3, "testLTRIM");
    });

    client.ltrim('list0', 0, 1, expectOK("testLTRIM"))

    client.llen('list0', function (err, len) {
        if (err) assert.fail(err, "testLTRIM");
        checkEqual(len, 2, "testLTRIM");
    });

    client.lrange('list0', 0, -1, function (err, values) {
        if (err) assert.fail(err, "testLTRIM");
        checkEqual(values.length, 2, "testLTRIM");
        checkEqual(values[0], 'list0value0', "testLTRIM");
        checkEqual(values[1], 'list0value1', "testLTRIM");
    });
}

function testLINDEX() {
    client.rpush('list0', 'list0value0', expectNumber(1, "testLINDEX"));
    client.rpush('list0', 'list0value1', expectNumber(2, "testLINDEX"));

    client.lindex('list0', 0, function (err, value) {
        if (err) assert.fail(err, "testLINDEX");
        checkEqual(value, 'list0value0', "testLINDEX");
    });

    client.lindex('list0', 1, function (err, value) {
        if (err) assert.fail(err, "testLINDEX");
        checkEqual(value, 'list0value1', "testLINDEX");
    });

    // out of range => null

    client.lindex('list0', 2, function (err, value) {
        if (err) assert.fail(err, "testLINDEX");
        checkEqual(value, null, "testLINDEX");
    });
}

function testLSET() {
    client.rpush('list0', 'list0value0', expectNumber(1, "testLSET"));
    client.lset('list0', 0, 'LIST0VALUE0', expectOK("testLSET"));

    client.lrange('list0', 0, 0, function (err, values) {
        if (err) assert.fail(err, "testLSET");
        checkEqual(values.length, 1, "testLSET");
        checkEqual(values[0], 'LIST0VALUE0', "testLSET");
    });
}

function testLREM() {
    client.lpush('list0', 'ABC', expectNumber(1, "testLREM"));
    client.lpush('list0', 'DEF', expectNumber(2, "testLREM"));
    client.lpush('list0', 'ABC', expectNumber(3, "testLREM"));

    client.lrem('list0', 1, 'ABC', expectNumber(1, "testLREM"));

    client.lrange('list0', 0, -1, function (err, values) {
        if (err) assert.fail(err, "testLREM");
        checkEqual(values.length, 2, "testLREM");
        checkEqual(values[0], 'DEF', "testLREM");
        checkEqual(values[1], 'ABC', "testLREM");
    });
}

function testLPOP() {
    client.lpush('list0', 'ABC', expectNumber(1, "testLPOP"));
    client.lpush('list0', 'DEF', expectNumber(2, "testLPOP"));
    client.lpush('list0', 'GHI', expectNumber(3, "testLPOP"));

    client.lpop('list0', function (err, value) {
        if (err) assert.fail(err, "testLPOP");
        checkEqual(value, 'GHI', "testLPOP");
    });

    client.lpop('list0', function (err, value) {
        if (err) assert.fail(err, "testLPOP");
        checkEqual(value, 'DEF', "testLPOP");
    });

    client.lrange('list0', 0, -1, function (err, values) {
        if (err) assert.fail(err, "testLPOP");
        checkEqual(values.length, 1, "testLPOP");
        checkEqual(values[0], 'ABC', "testLPOP");
    });
}

function testRPOP() {
    client.lpush('list0', 'ABC', expectNumber(1, "testRPOP"));
    client.lpush('list0', 'DEF', expectNumber(2, "testRPOP"));

    client.rpop('list0', function (err, value) {
        if (err) assert.fail(err, "testRPOP");
        checkEqual(value, 'ABC', "testRPOP");
    });

    client.rpop('list0', function (err, value) {
        if (err) assert.fail(err, "testRPOP");
        checkEqual(value, 'DEF', "testRPOP");
    });

    client.llen('list0', function (err, len) {
        if (err) assert.fail(err, "testRPOP");
        checkEqual(len, 0, "testRPOP");
    });
}

function testRPOPLPUSH() {
    client.rpush('src', 'ABC', expectNumber(1, "testRPOPLPUSH"));
    client.rpush('src', 'DEF', expectNumber(2, "testRPOPLPUSH"));

    client.rpoplpush('src', 'dst', function (err, value) {
        if (err) assert.fail(err, "testRPOPLPUSH");
        checkEqual(value, 'DEF', "testRPOPLPUSH");
    });

    client.lrange('src', 0, -1, function (err, values) {
        if (err) assert.fail(err, "testRPOPLPUSH");
        checkDeepEqual(values, [ 'ABC' ], "testRPOPLPUSH");
    });

    client.lrange('dst', 0, -1, function (err, values) {
        if (err) assert.fail(err, "testRPOPLPUSH");
        checkDeepEqual(values, [ 'DEF' ], "testRPOPLPUSH");
    });
}

function testSADD() {
    client.sadd('set0', 'member0', expectNumber(1, "testSADD"));
    client.sadd('set0', 'member0', expectNumber(0, "testSADD")); // already member
}

function testSISMEMBER() {
    client.sadd('set0', 'member0', expectNumber(1, "testSISMEMBER"));
    client.sismember('set0', 'member0', expectNumber(1, "testSISMEMBER"));
    client.sismember('set0', 'member1', expectNumber(0, "testSISMEMBER"));
}

function testSCARD() {
    client.sadd('set0', 'member0', expectNumber(1, "testSCARD"));
    client.scard('set0', expectNumber(1, "testSCARD"));

    client.sadd('set0', 'member1', expectNumber(1, "testSCARD"));
    client.scard('set0', expectNumber(2, "testSCARD"));
}

function testSREM() {
    client.sadd('set0', 'member0', expectNumber(1, "testSREM"));
    client.srem('set0', 'foobar', expectNumber(0, "testSREM"))
    client.srem('set0', 'member0', expectNumber(1, "testSREM"))
    client.scard('set0', expectNumber(0, "testSREM"));
}

function testSPOP() {
    client.sadd('zzz', 'member0', expectNumber(1, "testSPOP"));
    client.scard('zzz', expectNumber(1, "testSPOP"));

    client.spop('zzz', function (err, value) {
        if (err) assert.fail(err, "testSPOP");
        checkEqual(value, 'member0', "testSPOP");
    });

    client.scard('zzz', expectNumber(0, "testSPOP"));
}

function testSDIFF() {
    client.sadd('foo', 'x', expectNumber(1, "testSDIFF"));
    client.sadd('foo', 'a', expectNumber(1, "testSDIFF"));
    client.sadd('foo', 'b', expectNumber(1, "testSDIFF"));
    client.sadd('foo', 'c', expectNumber(1, "testSDIFF"));

    client.sadd('bar', 'c', expectNumber(1, "testSDIFF"));

    client.sadd('baz', 'a', expectNumber(1, "testSDIFF"));
    client.sadd('baz', 'd', expectNumber(1, "testSDIFF"));

    client.sdiff('foo', 'bar', 'baz', function (err, values) {
        if (err) assert.fail(err, "testSDIFF");
        values.sort();
        checkEqual(values.length, 2, "testSDIFF");
        checkEqual(values[0], 'b', "testSDIFF");
        checkEqual(values[1], 'x', "testSDIFF");
    });
}

function testSDIFFSTORE() {
    client.sadd('foo', 'x', expectNumber(1, "testSDIFFSTORE"))
    client.sadd('foo', 'a', expectNumber(1, "testSDIFFSTORE"))
    client.sadd('foo', 'b', expectNumber(1, "testSDIFFSTORE"))
    client.sadd('foo', 'c', expectNumber(1, "testSDIFFSTORE"))

    client.sadd('bar', 'c', expectNumber(1, "testSDIFFSTORE"))

    client.sadd('baz', 'a', expectNumber(1, "testSDIFFSTORE"))
    client.sadd('baz', 'd', expectNumber(1, "testSDIFFSTORE"))

    // NB: SDIFFSTORE returns the number of elements in the dstkey 

    client.sdiffstore('quux', 'foo', 'bar', 'baz', expectNumber(2, "testSDIFFSTORE"))

    client.smembers('quux', function (err, members) {
        if (err) assert.fail(err, "testSDIFFSTORE");
        members.sort();
        checkDeepEqual(members, [ 'b', 'x' ], "testSDIFFSTORE");
    });
}

function testSMEMBERS() {
    client.sadd('foo', 'x', expectNumber(1, "testSMEMBERS"));

    client.smembers('foo', function (err, members) {
        if (err) assert.fail(err, "testSMEMBERS");
        checkDeepEqual(members, [ 'x' ], "testSMEMBERS");
    });

    client.sadd('foo', 'y', expectNumber(1, "testSMEMBERS"));

    client.smembers('foo', function (err, members) {
        if (err) assert.fail(err, "testSMEMBERS");
        checkEqual(members.length, 2, "testSMEMBERS");
        checkDeepEqual(members.sort(), [ 'x', 'y' ], "testSMEMBERS");
    });
}

function testSMOVE() {
    client.sadd('foo', 'x', expectNumber(1, "testSMOVE"));
    client.smove('foo', 'bar', 'x', expectNumber(1, "testSMOVE"));
    client.sismember('foo', 'x', expectNumber(0, "testSMOVE"));
    client.sismember('bar', 'x', expectNumber(1, "testSMOVE"));
    client.smove('foo', 'bar', 'x', expectNumber(0, "testSMOVE"));
}

function testSINTER() {
    client.sadd('sa', 'a', expectNumber(1, "testSINTER"));
    client.sadd('sa', 'b', expectNumber(1, "testSINTER"));
    client.sadd('sa', 'c', expectNumber(1, "testSINTER"));

    client.sadd('sb', 'b', expectNumber(1, "testSINTER"));
    client.sadd('sb', 'c', expectNumber(1, "testSINTER"));
    client.sadd('sb', 'd', expectNumber(1, "testSINTER"));

    client.sadd('sc', 'c', expectNumber(1, "testSINTER"));
    client.sadd('sc', 'd', expectNumber(1, "testSINTER"));
    client.sadd('sc', 'e', expectNumber(1, "testSINTER"));

    client.sinter('sa', 'sb', function (err, intersection) {
        if (err) assert.fail(err, "testSINTER");
        checkEqual(intersection.length, 2, "testSINTER");
        checkDeepEqual(intersection.sort(), [ 'b', 'c' ], "testSINTER");
    });

    client.sinter('sb', 'sc', function (err, intersection) {
        if (err) assert.fail(err, "testSINTER");
        checkEqual(intersection.length, 2, "testSINTER");
        checkDeepEqual(intersection.sort(), [ 'c', 'd' ], "testSINTER");
    });

    client.sinter('sa', 'sc', function (err, intersection) {
        if (err) assert.fail(err, "testSINTER");
        checkEqual(intersection.length, 1, "testSINTER");
        checkEqual(intersection[0], 'c', "testSINTER");
    });

    // 3-way

    client.sinter('sa', 'sb', 'sc', function (err, intersection) {
        if (err) assert.fail(err, "testSINTER");
        checkEqual(intersection.length, 1, "testSINTER");
        checkEqual(intersection[0], 'c', "testSINTER");
    });
}

function testSINTERSTORE() {
    client.sadd('sa', 'a', expectNumber(1, "testSINTERSTORE"));
    client.sadd('sa', 'b', expectNumber(1, "testSINTERSTORE"));
    client.sadd('sa', 'c', expectNumber(1, "testSINTERSTORE"));

    client.sadd('sb', 'b', expectNumber(1, "testSINTERSTORE"));
    client.sadd('sb', 'c', expectNumber(1, "testSINTERSTORE"));
    client.sadd('sb', 'd', expectNumber(1, "testSINTERSTORE"));

    client.sadd('sc', 'c', expectNumber(1, "testSINTERSTORE"));
    client.sadd('sc', 'd', expectNumber(1, "testSINTERSTORE"));
    client.sadd('sc', 'e', expectNumber(1, "testSINTERSTORE"));

    client.sinterstore('foo', 'sa', 'sb', 'sc', expectNumber(1, "testSINTERSTORE"))

    client.smembers('foo', function (err, members) {
        if (err) assert.fail(err, "testSINTERSTORE");
        checkDeepEqual(members, [ 'c' ], "testSINTERSTORE");
    });
}

function testSUNION() {
    client.sadd('sa', 'a', expectNumber(1, "testUNION"));
    client.sadd('sa', 'b', expectNumber(1, "testUNION"));
    client.sadd('sa', 'c', expectNumber(1, "testUNION"));

    client.sadd('sb', 'b', expectNumber(1, "testUNION"));
    client.sadd('sb', 'c', expectNumber(1, "testUNION"));
    client.sadd('sb', 'd', expectNumber(1, "testUNION"));

    client.sadd('sc', 'c', expectNumber(1, "testUNION"));
    client.sadd('sc', 'd', expectNumber(1, "testUNION"));
    client.sadd('sc', 'e', expectNumber(1, "testUNION"));

    client.sunion('sa', 'sb', 'sc', function (err, union) {
        if (err) assert.fail(err, "testUNION");
        checkDeepEqual(union.sort(), ['a', 'b', 'c', 'd', 'e'], "testUNION");
    });
}

function testSUNIONSTORE() {
    client.sadd('sa', 'a', expectNumber(1, "testUNIONSTORE"));
    client.sadd('sa', 'b', expectNumber(1, "testUNIONSTORE"));
    client.sadd('sa', 'c', expectNumber(1, "testUNIONSTORE"));

    client.sadd('sb', 'b', expectNumber(1, "testUNIONSTORE"));
    client.sadd('sb', 'c', expectNumber(1, "testUNIONSTORE"));
    client.sadd('sb', 'd', expectNumber(1, "testUNIONSTORE"));

    client.sadd('sc', 'c', expectNumber(1, "testUNIONSTORE"));
    client.sadd('sc', 'd', expectNumber(1, "testUNIONSTORE"));
    client.sadd('sc', 'e', expectNumber(1, "testUNIONSTORE"));

    client.sunionstore('foo', 'sa', 'sb', 'sc', function (err, cardinality) {
        if (err) assert.fail(err, "testUNIONSTORE");
        checkEqual(cardinality, 5, "testUNIONSTORE");
    });

    client.smembers('foo', function (err, members) {
        if (err) assert.fail(err, "testUNIONSTORE");
        checkEqual(members.length, 5, "testUNIONSTORE");
        checkDeepEqual(members.sort(), ['a', 'b', 'c', 'd', 'e'], "testUNIONSTORE");
    });
}

function testTYPE() {
    client.sadd('sa', 'a', expectNumber(1, "testTYPE"));
    client.type('sa', function (err, type) {
        if (err) assert.fail(err, "testTYPE");
        checkEqual(type, 'set', "testTYPE");
    });

    client.rpush('list0', 'x', expectNumber(1, "testTYPE"));
    client.type('list0', function (err, type) {
        if (err) assert.fail(err, "testTYPE");
        checkEqual(type, 'list', "testTYPE");
    });

    client.set('foo', 'bar', expectOK("testTYPE"));
    client.type('foo', function (err, type) {
        if (err) assert.fail(err, "testTYPE");
        checkEqual(type, 'string', "testTYPE");
    });

    client.type('xxx', function (err, type) {
        if (err) assert.fail(err, "testTYPE");
        checkEqual(type, 'none', "testTYPE");
    });
}

function testMOVE() {
    client.rpush('list0', 'x', expectNumber(1, "testMOVE"));
    client.move('list0', TEST_DB_NUMBER_FOR_MOVE, expectNumber(1, "testMOVE"));

    client.select(TEST_DB_NUMBER_FOR_MOVE, expectOK("testMOVE"));
    client.exists('list0', expectNumber(1, "testMOVE"));

    client.select(TEST_DB_NUMBER, expectOK("testMOVE"));
    client.exists('list0', expectNumber(0, "testMOVE"));
}

// TODO sort with STORE option.

// Sort is a beast.
//
// $ redis-cli lrange x 0 -1
// 1. 3
// 2. 9
// 3. 2
// 4. 4
//
// $ redis-cli mget w3 w9 w2 w4
// 1. 4
// 2. 5
// 3. 12
// 4. 6
//
// $ redis-cli sort x by w*
// 1. 3
// 2. 9
// 3. 4
// 4. 2
//
// When using 'by w*' value x[i]'s effective value is w{x[i]}.
//
// sort [ w3, w9, w2, w4 ] = sort [ 4, 5, 12, 6 ]
//                         = [ 4, 5, 6, 12 ]
//                         = [ w3, w9, w4, w2 ]
//
// Thus, sorting x 'by w*' results in [ 3, 9, 4, 2 ]
//
// Once sorted redis can fetch entries at the keys indicated by the 'get'
// pattern. If we specify 'get o*', redis would fetch [ o3, o9, o4, o2 ] 
// since our sorted list was [ 3, 9, 4, 2 ].
//
// $ redis-cli mget o2 o3 o4 o9
// 1. buz
// 2. foo
// 3. baz
// 4. bar
//
// $ redis-cli sort x by w* get o*
// 1. foo
// 2. bar
// 3. baz
// 4. buz
//
// One can specify multiple get patterns and the keys for each get pattern
// are interlaced in the results.
//
// $ redis-cli mget p2 p3 p4 p9
// 1. qux
// 2. bux
// 3. lux
// 4. tux
//
// $ redis-cli sort x by w* get o* get p*
// 1. foo
// 2. bux
// 3. bar
// 4. tux
// 5. baz
// 6. lux
// 7. buz
// 8. qux
//
// Phew! Now, let's test all that.

function testSORT() {
    client.rpush('y', 'd', expectNumber(1, "testSORT"));
    client.rpush('y', 'b', expectNumber(2, "testSORT"));
    client.rpush('y', 'a', expectNumber(3, "testSORT"));
    client.rpush('y', 'c', expectNumber(4, "testSORT"));

    client.rpush('x', '3', expectNumber(1, "testSORT"));
    client.rpush('x', '9', expectNumber(2, "testSORT"));
    client.rpush('x', '2', expectNumber(3, "testSORT"));
    client.rpush('x', '4', expectNumber(4, "testSORT"));

    client.set('w3', '4', expectOK("testSORT"));
    client.set('w9', '5', expectOK("testSORT"));
    client.set('w2', '12', expectOK("testSORT"));
    client.set('w4', '6', expectOK("testSORT"));

    client.set('o2', 'buz', expectOK("testSORT"));
    client.set('o3', 'foo', expectOK("testSORT"));
    client.set('o4', 'baz', expectOK("testSORT"));
    client.set('o9', 'bar', expectOK("testSORT"));

    client.set('p2', 'qux', expectOK("testSORT"));
    client.set('p3', 'bux', expectOK("testSORT"));
    client.set('p4', 'lux', expectOK("testSORT"));
    client.set('p9', 'tux', expectOK("testSORT"));

    // Now the data has been setup, we can test.

    // But first, test basic sorting.

    // y = [ d b a c ]
    // sort y ascending = [ a b c d ]
    // sort y descending = [ d c b a ]

    client.sort('y', 'asc', 'alpha', function (err, sorted) {
        if (err) assert.fail(err, "testSORT");
        checkDeepEqual(sorted, ['a', 'b', 'c', 'd'], "testSORT");
    });

    client.sort('y', 'desc', 'alpha', function (err, sorted) {
        if (err) assert.fail(err, "testSORT");
        checkDeepEqual(sorted, ['d', 'c', 'b', 'a'], "testSORT");
    });

    // Now try sorting numbers in a list.
    // x = [ 3, 9, 2, 4 ]

    client.sort('x', 'asc', function (err, sorted) {
        if (err) assert.fail(err, "testSORT");
        checkDeepEqual(sorted, [2, 3, 4, 9], "testSORT");
    });

    client.sort('x', 'desc', function (err, sorted) {
        if (err) assert.fail(err, "testSORT");
        checkDeepEqual(sorted, [9, 4, 3, 2], "testSORT");
    });

    // Try sorting with a 'by' pattern.

    client.sort('x', 'by', 'w*', 'asc', function (err, sorted) {
        if (err) assert.fail(err, "testSORT");
        checkDeepEqual(sorted, [3, 9, 4, 2], "testSORT");
    });

    // Try sorting with a 'by' pattern and 1 'get' pattern.

    client.sort('x', 'by', 'w*', 'asc', 'get', 'o*', function (err, sorted) {
        if (err) assert.fail(err, "testSORT");
        checkDeepEqual(sorted, ['foo', 'bar', 'baz', 'buz'], "testSORT");
    });

    // Try sorting with a 'by' pattern and 2 'get' patterns.

    client.sort('x', 'by', 'w*', 'asc', 'get', 'o*', 'get', 'p*', function (err, sorted) {
        if (err) assert.fail(err, "testSORT");
        checkDeepEqual(sorted, ['foo', 'bux', 'bar', 'tux', 'baz', 'lux', 'buz', 'qux'], "testSORT");
    });

    // Try sorting with a 'by' pattern and 2 'get' patterns.
    // Instead of getting back the sorted set/list, store the values to a list.
    // Then check that the values are there in the expected order.

    client.sort('x', 'by', 'w*', 'asc', 'get', 'o*', 'get', 'p*', 'store', 'bacon', function (err) {
        if (err) assert.fail(err, "testSORT");
    });

    client.lrange('bacon', 0, -1, function (err, values) {
        if (err) assert.fail(err, "testSORT");
        checkDeepEqual(values, ['foo', 'bux', 'bar', 'tux', 'baz', 'lux', 'buz', 'qux'], "testSORT");
    });
}

function testSAVE() {
    client.save(expectOK("testSAVE"));
}

function testBGSAVE() {
    sys.debug("This test does not do anything.");
}

function testLASTSAVE() {
    client.lastsave( function (err, value) {
        if (err) assert.fail(err, "testLASTSAVE");
        checkEqual(typeof(value), 'number', "testLASTSAVE");
        check(value > 0, "testLASTSAVE");
    });
}

function testFLUSHALL() {
    sys.debug("This test does not do anything.");
}

function testSHUTDOWN() {
    sys.debug("This test does not do anything.");
}

function testMSET() {
    // set a=b, c=d, e=100

    client.mset('a', 'b', 'c', 'd', 'e', 100, expectOK("testMSET"));
}

function testMSETNX() {
    client.mset('a', 'b', 'c', 'd', 'e', 100, expectOK("testMSET"));

    // should fail since as 'a' already exists.

    client.msetnx('g', 'h', 'a', 'i', expectNumber(0, "testMSETNX"));

    // should pass as key 'g' was NOT set in prev. command
    // since it failed due to key 'a' already existing.

    client.msetnx('g', 'h', 'i', 'j', expectNumber(1, "testMSETNX"));
}

function testZADD() {
    client.zadd('z0', 100, 'm0', expectNumber(1, "testZADD"));

    // Already added m0; just update the score to 50.
    // Redis returns 0 in this case.

    client.zadd('z0', 50, 'm0', expectNumber(0, "testZADD"));
}

function testZREM() {
    client.zadd('z0', 100, 'm0', expectNumber(1, "testZREM"));
    client.zrem('z0', 'm0', expectNumber(1, "testZREM"));
    client.zrem('z0', 'm0', expectNumber(0, "testZREM"));
}

function testZCARD() {
    client.zcard('zzzzzz', expectNumber(0, "testZCARD")); // doesn't exist.

    client.zadd('z0', 100, 'm0', expectNumber(1, "testZCARD"));
    client.zadd('z0', 200, 'm1', expectNumber(1, "testZCARD"));

    client.zcard('z0', expectNumber(2, "testZCARD"));
}

function testZSCORE() {
    client.zadd('z0', 100, 'm0', expectNumber(1, "testZSCORE"));
    client.zadd('z0', 200, 'm1', expectNumber(1, "testZSCORE"));

    client.zscore('z0', 'm0', expectNumber(100, "testZSCORE"));
    client.zscore('z0', 'm1', expectNumber(200, "testZSCORE"));

    client.zscore('z0', 'zzzzzzz', function (err, score) {
        if (err) assert.fail(err, "testZSCORE");
        checkEqual(score, null, "testZSCORE");
    });
}

function testZRANGE() {
    client.zadd('z0', 100, 'm0', expectNumber(1, "testZRANGE"));
    client.zadd('z0', 200, 'm1', expectNumber(1, "testZRANGE"));
    client.zadd('z0', 300, 'm2', expectNumber(1, "testZRANGE"));

    client.zrange('z0', 0, -1, function (err, members) {
        if (err) assert.fail(err, "testZRANGE");
        checkDeepEqual(members, [ 'm0', 'm1', 'm2' ], "testZRANGE");
    });

    client.zrange('z0', -1, -1, function (err, members) {
        if (err) assert.fail(err, "testZRANGE");
        checkDeepEqual(members, [ 'm2' ], "testZRANGE");
    });

    client.zrange('z0', -2, -1, function (err, members) {
        if (err) assert.fail(err, "testZRANGE");
        checkDeepEqual(members, [ 'm1', 'm2' ], "testZRANGE");
    });
}

function testZREVRANGE() {
    client.zadd('z0', 100, 'm0', expectNumber(1, "testZREVRANGE"));
    client.zadd('z0', 200, 'm1', expectNumber(1, "testZREVRANGE"));
    client.zadd('z0', 300, 'm2', expectNumber(1, "testZREVRANGE"));

    client.zrevrange('z0', 0, 1000, function (err, members) {
        if (err) assert.fail(err, "testZREVRANGE");
        checkDeepEqual(members, [ 'm2', 'm1', 'm0' ], "testZREVRANGE");
    });
}

function testZRANGEBYSCORE() {
    client.zadd('z0', 100, 'm0', expectNumber(1, "testZRANGEBYSCORE 1"));
    client.zadd('z0', 200, 'm1', expectNumber(1, "testZRANGEBYSCORE 2"));
    client.zadd('z0', 300, 'm2', expectNumber(1, "testZRANGEBYSCORE 3"));

    client.zrangebyscore('z0', 200, 300, function (err, members) {
        if (err) assert.fail(err, "testZRANGEBYSCORE 4");
        checkDeepEqual(members, [ 'm1', 'm2' ], "testZRANGEBYSCORE 5");
    });

    client.zrangebyscore('z0', 100, 1000, function (err, members) {
        if (err) assert.fail(err, "testZRANGEBYSCORE 6");
        checkDeepEqual(members, [ 'm0', 'm1', 'm2' ], "testZRANGEBYSCORE 7");
    });

    client.zrangebyscore('z0', 10000, 100000, function (err, members) {
        sys.debug("************"+JSON.stringify(members));
        if (err) assert.fail(err, "testZRANGEBYSCORE 8");
        checkEqual(members.length, 0, "testZRANGEBYSCORE 9");
    });
}

// zcount is undocumented as of Thu Apr 01 20:17:58 EDT 2010 
// zcount key startScore endScore => number of elements in [startScore, endScore]

function testZCOUNT() {
    client.zcount('z0', 0, 100, expectNumber(0, "testZCOUNT"));

    client.zadd('z0', 1, 'a', expectNumber(1, "testZCOUNT"));
    client.zcount('z0', 0, 100, expectNumber(1, "testZCOUNT"));

    client.zadd('z0', 2, 'b', expectNumber(1, "testZCOUNT"));
    client.zcount('z0', 0, 100, expectNumber(2, "testZCOUNT"));
}

function testZINCRBY() {
    client.zadd('z0', 1, 'a', expectNumber(1, "testZINCRBY"));
    client.zincrby('z0', 1, 'a', expectNumber(2, "testZINCRBY"));
}

// This really should be called ZINTERSTORE.

function testZINTER() {
    client.zadd('z0', 1, 'a', expectNumber(1, "testZINTER"));
    client.zadd('z0', 2, 'b', expectNumber(1, "testZINTER"));
    client.zadd('z1', 3, 'a', expectNumber(1, "testZINTER"));
    client.zinter('z2', 2, 'z0', 'z1', 'AGGREGATE', 'SUM', expectNumber(1, "testZINTER"));
    client.zrange('z2', 0, -1, 'WITHSCORES', function (err, members) {
        if (err) assert.fail(err, "testZINTER");
        checkDeepEqual(members, [ 'a', 4 ], "testZINTER");    // score=1+3
    });
}

function testZUNION() {
    client.zadd('z0', 1, 'a', expectNumber(1, "testZUNION"));
    client.zadd('z0', 2, 'b', expectNumber(1, "testZUNION"));
    client.zadd('z1', 3, 'a', expectNumber(1, "testZUNION"));
    client.zunion('z2', 2, 'z0', 'z1', 'AGGREGATE', 'SUM', expectNumber(2, "testZUNION"));
    client.zrange('z2', 0, -1, 'WITHSCORES', function (err, members) {
        if (err) assert.fail(err, "testZUNION");
        check(members.length % 2 == 0, "testZUNION");
        var set = {};
        for (var i=0; i<members.length; i += 2)
            set[members[i]] = members[i + 1];
        checkDeepEqual(set, { a:4, b:2 }, "testZUNION");    // a's score=1+3
    });
}

function testZRANK() {
    client.zadd('z0', 1, 'a', expectNumber(1, "testZRANK"));
    client.zadd('z0', 2, 'b', expectNumber(1, "testZRANK"));
    client.zadd('z0', 3, 'c', expectNumber(1, "testZRANK"));

    client.zrank('z0', 'a', expectNumber(0, "testZRANK"));
    client.zrank('z0', 'b', expectNumber(1, "testZRANK"));
    client.zrank('z0', 'c', expectNumber(2, "testZRANK"));
}

function testZREVRANK() {
    client.zadd('z0', 1, 'a', expectNumber(1, "testZREVRANK"));
    client.zadd('z0', 2, 'b', expectNumber(1, "testZREVRANK"));
    client.zadd('z0', 3, 'c', expectNumber(1, "testZREVRANK"));

    client.zrevrank('z0', 'a', expectNumber(2, "testZREVRANK"));
    client.zrevrank('z0', 'b', expectNumber(1, "testZREVRANK"));
    client.zrevrank('z0', 'c', expectNumber(0, "testZREVRANK"));
}

function testZREMRANGEBYRANK() {
    client.zadd('z0', 1, 'a', expectNumber(1, "testZREMRANGEBYRANK"));
    client.zadd('z0', 2, 'b', expectNumber(1, "testZREMRANGEBYRANK"));
    client.zadd('z0', 3, 'c', expectNumber(1, "testZREMRANGEBYRANK"));

    client.zremrangebyrank('z0', -1, -1, expectNumber(1, "testZREMRANGEBYRANK"));

    client.zrange('z0', 0, -1, 'WITHSCORES', function (err, members) {
        if (err) assert.fail(err, "testZREMRANGEBYRANK");
        check(members.length % 2 == 0, "testZREMRANGEBYRANK");
        var set = {};
        for (var i=0; i<members.length; i += 2)
            set[members[i]] = members[i + 1];
        checkDeepEqual(set, { a:1, b:2 }, "testZREMRANGEBYRANK");
    });
}

function testZREMRANGEBYSCORE() {
    client.zadd('z0', 1, 'a', expectNumber(1, "testZREMRANGEBYSCORE"));
    client.zadd('z0', 2, 'b', expectNumber(1, "testZREMRANGEBYSCORE"));
    client.zadd('z0', 3, 'c', expectNumber(1, "testZREMRANGEBYSCORE"));

    // inclusive
    client.zremrangebyscore('z0', 2, 3, expectNumber(2, "testZREMRANGEBYSCORE"));

    client.zrange('z0', 0, -1, 'WITHSCORES', function (err, members) {
        if (err) assert.fail(err, "testZREMRANGEBYSCORE");
        check(members.length % 2 == 0, "testZREMRANGEBYSCORE");
        var set = {};
        for (var i=0; i<members.length; i += 2)
            set[members[i]] = members[i + 1];
        checkDeepEqual(set, { a:1 }, "testZREMRANGEBYSCORE");
    });
}

function testHDEL() {
    client.hset("foo", "bar", "baz", expectNumber(1, "testHDEL"));
    client.hdel("foo", "bar", expectNumber(1, "testHDEL"));
    client.hdel("foo", "bar", expectNumber(0, "testHDEL"));
}

function testHEXISTS() {
    client.hset("hfoo", "bar", "baz", expectNumber(1, "testHEXISTS"));
    client.hexists("hfoo", "bar", expectNumber(1, "testHEXISTS"));
    client.hexists("hfoo", "baz", expectNumber(0, "testHEXISTS"));
}

function testHGET() {
    client.hset("foo", "bar", "baz", expectNumber(1, "testHGET"));
    client.hget("foo", "bar", function (err, reply) {
        if (err) assert.fail(err, "testHGET");
        checkEqual("baz", reply, "testHGET");
    });
}

function testHGETALL() {
    client.hset("foo", "bar", "baz", expectNumber(1, "testHGETALL"));
    client.hset("foo", "quux", "doo", expectNumber(1, "testHGETALL"));
    client.hgetall("foo", function (err, all) {
        if (err) assert.fail(err, "testHGETALL");
        checkDeepEqual(all, { bar:"baz", quux:"doo" }, "testHGETALL");
    });
}

function testHINCRBY() {
    client.hincrby("foo", "bar", 1, expectNumber(1, "testHINCRBY 1"));
    client.hget("foo", "bar", expectNumber(1, "testHINCRBY 2"));

    client.hincrby("foo", "bar", 1, expectNumber(2, "testHINCRBY 3"));
    client.hget("foo", "bar", expectNumber(2, "testHINCRBY 4"));
}

function testHKEYS() {
    client.hset("foo", "bar", "baz", expectNumber(1, "testHKEYS"));
    client.hset("foo", "quux", "doo", expectNumber(1, "testHKEYS"));
    client.hkeys("foo", function (err, reply) {
        if (err) assert.fail(err, "testHKEYS");
        checkDeepEqual(reply.sort(), [ "bar", "quux" ], "testHKEYS");
    });
}

function testHVALS() {
    client.hset("foo", "bar", "baz", expectNumber(1, "testHVALS"));
    client.hset("foo", "quux", "doo", expectNumber(1, "testHVALS"));
    client.hvals("foo", function (err, reply) {
        if (err) assert.fail(err, "testHVALS");
        checkDeepEqual(reply.sort(), [ "baz", "doo" ], "testHVALS");
    });
}

function testHLEN() {
    client.hlen("foo", expectNumber(0, "testHLEN"));
    client.hset("foo", "bar", "baz", expectNumber(1, "testHLEN"));
    client.hlen("foo", expectNumber(1, "testHLEN"));
    client.hset("foo", "quux", "doo", expectNumber(1, "testHLEN"));
    client.hlen("foo", expectNumber(2, "testHLEN"));
}

function testHSET() {
    client.hset("foo", "bar", "baz", expectNumber(1, "testHSET"));
    client.hget("foo", "bar", function (err, reply) {
        if (err) assert.fail(err, "testHSET");
        checkEqual("baz", reply, "testHSET");
    });
}

// Note that the user of this client should add a listener for "connect" via
// client.stream.addListener("connect", function () { ... }); in order to
// subscribe to channels/classes of interest after each connection is established
// (subscriptions are not remembered across connections and reconnections).

// We need a 2nd client to act as publisher in order to test that a message
// is received after SUBSCRIBE[ing] to a channel/class.  We can at least test
// that SUBSCRIBE itself does not fail (it shouldn't).

function testSUBSCRIBE() {
    client.subscribe("#redis", function (err, reply) {
        if (err) assert.fail(err, "testSUBSCRIBE");
        checkDeepEqual(reply, [ "subscribe", "#redis", 1 ], "testSUBSCRIBE");
    });

    client.subscribe("#Node.js", function (err, reply) {
        if (err) assert.fail(err, "testSUBSCRIBE");
        checkDeepEqual(reply, [ "subscribe", "#Node.js", 2 ], "testSUBSCRIBE");
    });

    client.unsubscribe("#redis", function (err, reply) {
        if (err) assert.fail(err, "testSUBSCRIBE");
        checkDeepEqual(reply, [ "unsubscribe", "#redis", 1 ], "testSUBSCRIBE");
    });

    client.unsubscribe("#Node.js", function (err, reply) {
        if (err) assert.fail(err, "testSUBSCRIBE");
        checkDeepEqual(reply, [ "unsubscribe", "#Node.js", 0 ], "testSUBSCRIBE");
    });
}

function testUNSUBSCRIBE() {
    sys.debug("This test does not do anything.");
}

function testPSUBSCRIBE() {
    client.psubscribe("cooking.*", function (err, reply) {
        if (err) assert.fail(err, "testPSUBSCRIBE");
        checkDeepEqual(reply, [ "psubscribe", "cooking.*", 1 ], "testPSUBSCRIBE");
    });

    client.punsubscribe("cooking.*", function (err, reply) {
        if (err) assert.fail(err, "testPSUBSCRIBE");
        checkDeepEqual(reply, [ "punsubscribe", "cooking.*", 0 ], "testPSUBSCRIBE");
    });
}

function testPUNSUBSCRIBE() {
    sys.debug("This test does not do anything.");
}

function testPUBLISH() {
    // No one is subscribed so 0

    client.publish("#redis", "Hello, world!", expectNumber(0, "testPUBLISH"));
}

var messageWasReceived = false;

function testSUBSCRIBEandPUBLISH() {
    var messagePayload = "I'm a lumberjack!";
    var channelName = "Monty";     

    client.subscribeTo(channelName, function (channel, message) {
        checkEqual(channel, channelName, "testSUBSCRIBEandPUBLISH a0");
        checkEqual(message, messagePayload, "testSUBSCRIBEandPUBLISH a1");
        messageWasReceived = true;
    }); 

    // Create a 2nd client that publishes a message.

    var publisher = redisclient.createClient();
    publisher.stream.addListener("connect", function () {
        publisher.publish(channelName, messagePayload, function (err, reply) {
            if (err) assert.fail(err, "testSUBSCRIBEandPUBLISH b0");
            expectNumber(1, "testSUBSCRIBEandPUBLISH b1");
        });
    });
}

// We cannot test the blocking behavior of BLPOP and BRPOP from a single client
// without using a timeout.  That being said, we can test the non-blocking
// behavior by ensuring there's an element in a list that we try to pop from.

function testBLPOP() {
    var timeout = 1;

    // Non-blocking against a single key.

    client.lpush('list0', 'ABC', expectNumber(1, "testBLPOP 1"));
    client.blpop('list0', timeout, function (err, reply) {
        if (err) assert.fail(err, "testBLPOP 2");
        checkDeepEqual(reply, [ "list0", "ABC" ], "testBLPOP 3");
    });

    // Non-blocking against multiple keys.
    // Returns the first one that has something in it.

    client.lpush('list0', 'ABC', expectNumber(1, "testBLPOP 4"));
    client.blpop('list1', 'list0', timeout, function (err, reply) {
        if (err) assert.fail(err, "testBLPOP 5");
        checkDeepEqual(reply, [ "list0", "ABC" ], "testBLPOP 6");
    });

    // Non-blocking against a single key that does not exist.
    // This should timeout after 1 second and return a null reply.

    client.blpop('listX', timeout, function (err, reply) {
        if (err) assert.fail(err, "testBLPOP 7");
        checkEqual(reply, null, "testBLPOP 8");
    });
}

function testBRPOP() {
    var timeout = 1;

    // Non-blocking against a single key.

    client.lpush('list0', 'ABC', expectNumber(1, "testBRPOP"));
    client.lpush('list0', 'DEF', expectNumber(2, "testBRPOP"));
    client.brpop('list0', timeout, function (err, reply) {
        if (err) assert.fail(err, "testBRPOP");
        checkDeepEqual([ "list0", "ABC" ], reply, "testBRPOP");
    });

    // Non-blocking against multiple keys.
    // Returns the first one that has something in it.

    client.lpush('list0', 'ABC', expectNumber(2, "testBRPOP"));
    client.brpop('list1', 'list0', timeout, function (err, reply) {
        if (err) assert.fail(err, "testBRPOP");
        checkDeepEqual(reply, [ "list0", "DEF" ], "testBRPOP");
    });

    // Non-blocking against a single key that does not exist.
    // This should timeout after 1 second and return a null reply.

    client.brpop('listX', timeout, function (err, reply) {
        if (err) assert.fail(err, "testBRPOP");
        checkEqual(reply, null, "testBRPOP");
    });
}

var allTestFunctions = [
    testAUTH,
    testBGSAVE,
    testBLPOP,
    testBRPOP,
    testDBSIZE,
    testDECR,
    testDECRBY,
    testDEL,
    testEXISTS,
    testEXPIRE,
    testFLUSHALL,
    testFLUSHDB,
    testGET,
    testGETSET,
    testHDEL, 
    testHEXISTS,
    testHGET,
    testHGETALL,
    testHINCRBY,
    testHKEYS,
    testHLEN,
    testHSET,
    testHVALS,
    testINCR,
    testINCRBY,
    testINFO,
    testKEYS,
    testLASTSAVE,
    testLINDEX,
    testLLEN,
    testLPOP,
    testLPUSH,
    testLRANGE,
    testLREM,
    testLSET,
    testLTRIM,
    testMGET,
    testMOVE,
    testMSET,
    testMSETNX,
    testParseBulkReply,
    testParseErrorReply,
    testParseInlineReply,
    testParseIntegerReply,
    testParseMultiBulkReply,
    testPSUBSCRIBE,
    testPUBLISH,
    testPUNSUBSCRIBE,
    testRANDOMKEY,
    testRENAME,
    testRENAMENX,
    testRPOP,
    testRPOPLPUSH,
    testRPUSH,
    testSADD,
    testSAVE,
    testSCARD,
    testSDIFF,
    testSDIFFSTORE,
    testSELECT,
    testSET,
    testSETANDGETMULTIBYTE,
    testSETNX,
    testSHUTDOWN,
    testSINTER,
    testSINTERSTORE,
    testSISMEMBER,
    testSMEMBERS,
    testSMOVE,
    testSORT,
    testSPOP,
    testSREM,
    testSUBSCRIBE,
    testSUNION,
    testSUNIONSTORE,
    testTTL,
    testTYPE,
    testUNSUBSCRIBE,
    testZADD,
    testZCARD,
    testZCOUNT,
    testZINCRBY,
    testZINTER,
    testZRANGE,
    testZRANGEBYSCORE,
    testZRANK,
    testZREM,
    testZREMRANGEBYRANK,
    testZREMRANGEBYSCORE,
    testZREVRANGE,
    testZREVRANK,
    testZSCORE,
    testZUNION,
];

function checkIfDone() {
    if (client.callbacks.length == 0) {
        testSUBSCRIBEandPUBLISH();
        
        var checks = 0;
        setInterval(function () {
            if (messageWasReceived) {
                sys.debug("");
                sys.debug("################################################################"); 
                sys.debug("All tests have completed successfully.");
                sys.debug("################################################################"); 
                sys.debug("");

                process.exit(0);
            } else {
                assert.notEqual(++checks, 5, "testSUBSCRIBEandPUBLISH never received message");
            } 
        }, 100);
    } else {
        sys.debug(client.callbacks.length + " callbacks still pending...");
    }
}

function runAllTests() {
    allTestFunctions.forEach(function (testFunction) {
        sys.debug("");
        sys.debug("Testing " + testFunction.name.replace(/^test/, ''));
        sys.debug("=========================================");

        clearTestDatabasesBeforeEachTest();
        testFunction();
    });

    setInterval(checkIfDone, 3000);
}

var connectionFailed = false;
var client = redisclient.createClient();
client.stream.addListener("connect", runAllTests);
client.stream.addListener("close", function (inError) {
    connectionFailed = inError;
    if (inError)
        throw new Error("Connection to Redis failed. Not attempting reconnection.");
});

function debugFilter(what) {
    var filtered = what;

    filtered = filtered.replace(/\r\n/g, '<CRLF>');
    filtered = filtered.replace(/\r/g, '<CR>');
    filtered = filtered.replace(/\n/g, '<LF>');

    return filtered;
}

