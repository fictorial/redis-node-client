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

function checkEqual(expected, actual, context) {
    try {
        assert.equal(expected, actual);
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

function checkDeepEqual(expected, actual, context) {
    try {
        assert.deepEqual(expected, actual);
    } catch (e) {
        showContext(context);
        throw e;
    }
}

// Redis' protocol returns +OK for some operations.
// The client converts this into a ECMAScript boolean type with value true.

function expectTrueReply(context) {
    return function (err, reply) {
        if (err) assert.fail(err, context);
        checkEqual(typeof(reply), 'boolean', context);
        check(reply, context);
    };
}

function maybeAsNumber(str) {
    var value = parseInt(str, 10);
    if (isNaN(value)) value = parseFloat(str);
    if (isNaN(value)) return str;
    return value;
}

function expectNumericReply(expectedValue, context) {
    return function (err, reply) {
        if (err) assert.fail(err, context);
        var value = maybeAsNumber(reply);
        checkEqual('number', typeof(value), context);
        checkEqual(expectedValue, value, context);
    };
}

function clearTestDatabasesBeforeEachTest() {
    client.select(TEST_DB_NUMBER_FOR_MOVE, expectTrueReply("select"));
    client.flushdb(expectTrueReply("flushdb"));

    client.select(TEST_DB_NUMBER, expectTrueReply("select"));
    client.flushdb(expectTrueReply("flushdb"));
}

function testParseBulkReply() {
    var a = "$6\r\nFOOBAR\r\n";
    client.readBuffer = a;
    var reply = client.parseBulkReply();
    checkEqual(reply, "FOOBAR", "testParseBulkReply");

    var b = "$-1\r\n";
    client.readBuffer = b;
    reply = client.parseBulkReply();
    checkEqual(reply, null, "testParseBulkReply");

    var c = "$-1\r";     // NB: partial command, missing \n
    client.readBuffer = c;
    reply = client.parseBulkReply();
    check(reply instanceof redisclient.PartialReply, "testParseBulkReply");
}

function testParseMultiBulkReply() {
    var a = "*4\r\n$3\r\nFOO\r\n$3\r\nBAR\r\n$5\r\nHELLO\r\n$5\r\nWORLD\r\n";
    client.readBuffer = a;
    var reply = client.parseMultiBulkReply();
    check(reply instanceof Array, "testParseMultiBulkReply");
    checkEqual(reply.length, 4, "testParseMultiBulkReply");
    checkDeepEqual(reply, ['FOO', 'BAR', 'HELLO', 'WORLD'], "testParseMultiBulkReply");

    var b = "$-1\r\n";
    client.readBuffer = b;
    reply = client.parseMultiBulkReply();
    checkEqual(reply, null, "testParseMultiBulkReply");

    var c = "*3\r\n$3\r\nFOO\r\n$-1\r\n$4\r\nBARZ\r\n";
    client.readBuffer = c;
    reply = client.parseMultiBulkReply();
    checkEqual(reply.length, 3, "testParseMultiBulkReply");
    checkDeepEqual(reply, ['FOO', null, 'BARZ'], "testParseMultiBulkReply");
}

function testParseInlineReply() {
    var a = "+OK\r\n";
    client.readBuffer = a;
    var reply = client.parseInlineReply();
    checkEqual(typeof(reply), 'boolean', "testParseInlineReply");
    checkEqual(true, reply, "testParseInlineReply");

    var b = "+WHATEVER\r\n";
    client.readBuffer = b;
    reply = client.parseInlineReply();
    checkEqual(typeof(reply), 'string', "testParseInlineReply");
    checkEqual('WHATEVER', reply, "testParseInlineReply");
}

function testParseIntegerReply() {
    var a = ":-1\r\n";
    client.readBuffer = a;
    var reply = client.parseIntegerReply();
    checkEqual(typeof(reply), 'number', "testParseIntegerReply");
    checkEqual(reply, -1, "testParseIntegerReply");

    var b = ":1000\r\n";
    client.readBuffer = b;
    reply = client.parseIntegerReply();
    checkEqual(typeof(reply), 'number', "testParseIntegerReply");
    checkEqual(reply, 1000, "testParseIntegerReply");
}

function testParseErrorReply() {
    var a = "-ERR solar flare\r\n";
    client.readBuffer = a;
    var reply = client.parseErrorReply();
    checkEqual(typeof(reply), 'string', "testParseErrorReply");
    checkEqual(reply, "ERR solar flare", "testParseErrorReply");

    var b = "-hiccup\r\n";
    client.readBuffer = b;
    reply = client.parseErrorReply();
    checkEqual(typeof(reply), 'string', "testParseErrorReply");
    checkEqual(reply, "hiccup", "testParseErrorReply");
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
    client.set('foo', 'bar', expectTrueReply("testSET"));
    client.set('baz', 'buz', expectTrueReply("testSET"));
    client.set('ggg', '123', expectTrueReply("testSET"));
    client.set('ggg', 123, expectTrueReply("testSET"));    // number
}

function testSETNX() {
    client.set('foo', 'bar', expectTrueReply("testSETNX"));
    client.setnx('foo', 'quux', expectNumericReply(0, "testSETNX"));    // fails when already set
    client.setnx('boo', 'apple', expectNumericReply(1, "testSETNX"));   // no such key already so OK
}

function testGET() {
    client.set('foo', 'bar', expectTrueReply("testGET"));
    client.set('baz', 'buz', expectTrueReply("testGET"));

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
    client.set('foo', 'bar', expectTrueReply("testMGET"));
    client.set('baz', 'buz', expectTrueReply("testMGET"));

    client.mget('foo', 'baz', function (err, values) {
        if (err) assert.fail(err, "testMGET");
        checkEqual(values[0], 'bar', "testMGET");
        checkEqual(values[1], 'buz', "testMGET");
    });
}

function testGETSET() {
    client.set('foo', 'bar', expectTrueReply("testGETSET"));

    client.getset('foo', 'fuzz', function (err, previousValue) {
        if (err) assert.fail(err, "testGETSET");
        checkEqual(previousValue, 'bar', "testGETSET");

        client.get('foo', function (err, value) {
            if (err) assert.fail(err, "testGETSET");
            checkEqual(value, 'fuzz', "testGETSET");
        });
    });
}

function testSETANDGETMULTIBYTE() {
    var testValue = unescape('%F6');
    client.set('unicode', testValue, expectTrueReply("testSETANDGETMULTIBYTE"))

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
    client.incr('counter', expectNumericReply(1, "testINCR"))
    client.incr('counter', expectNumericReply(2, "testINCR"))
}

function testINCRBY() {
    client.incrby('counter', '2', expectNumericReply(2, "testINCRBY"))
    client.incrby('counter', '-1', expectNumericReply(1, "testINCRBY"))
}

function testDECR() {
    client.decr('counter', expectNumericReply(-1, "tetDECR"))
    client.decr('counter', expectNumericReply(-2, "tetDECR"))
}

function testDECRBY() {
    client.decrby('counter', '1', expectNumericReply(-1, "testDECRBY"))
    client.decrby('counter', '2', expectNumericReply(-3, "testDECRBY"))
    client.decrby('counter', '-3', expectNumericReply(0, "testDECRBY"))
}

function testEXISTS() {
    client.set('foo', 'bar', expectTrueReply("testEXISTS"));
    client.exists('foo', expectNumericReply(1, "testEXISTS"))
    client.exists('foo2', expectNumericReply(0, "testEXISTS"))
}

function testDEL() {
    client.set('foo', 'bar', expectTrueReply("testDEL"));
    client.del('foo', expectNumericReply(1, "testDEL"));
    client.exists('foo', expectNumericReply(0, "testDEL"));
    client.del('foo', expectNumericReply(0, "testDEL"));
}

function testKEYS() {
    client.set('foo1', 'foo1Value', expectTrueReply("testKEYS"))
    client.set('foo2', 'foo2Value', expectTrueReply("testKEYS"))

    client.keys('foo*', function (err, keys) {
        if (err) assert.fail(err, "testKEYS");
        checkEqual(keys.length, 2, "testKEYS");
        checkDeepEqual(keys.sort(), ['foo1', 'foo2'], "testKEYS");
    });

    client.set('baz', 'bazValue', expectTrueReply("testKEYS"))
    client.set('boo', 'booValue', expectTrueReply("testKEYS"))

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
    client.set('foo', 'bar', expectTrueReply("testRANDOMKEY"));
    client.set('baz', 'buz', expectTrueReply("testRANDOMKEY"));

    client.randomkey(function (err, someKey) {
        if (err) assert.fail(err, "testRANDOMKEY");
        check(/^(foo|baz)$/.test(someKey), "testRANDOMKEY");
    });
}

function testRENAME() {
    client.set('foo', 'bar', expectTrueReply("testRENAME"));
    client.rename('foo', 'zoo', expectTrueReply("testRENAME"));
    client.exists('foo', expectNumericReply(0, "testRENAME"));
    client.exists('zoo', expectNumericReply(1, "testRENAME"));
}

function testRENAMENX() {
    client.set('foo', 'bar', expectTrueReply("testRENAMENX"));
    client.set('bar', 'baz', expectTrueReply("testRENAMENX"));
    client.renamenx('foo', 'bar', expectNumericReply(0, "testRENAMENX"));   // bar already exists
    client.exists('foo', expectNumericReply(1, "testRENAMENX"));            // was not renamed
    client.exists('bar', expectNumericReply(1, "testRENAMENX"));            // was not touched
    client.renamenx('foo', 'too', expectNumericReply(1, "testRENAMENX"));   // too did not exist... OK
    client.exists('foo', expectNumericReply(0, "testRENAMENX"));            // was renamed
    client.exists('too', expectNumericReply(1, "testRENAMENX"));            // was created
}

function testDBSIZE() {
    client.set('foo', 'bar', expectTrueReply("testDBSIZE"));
    client.set('bar', 'baz', expectTrueReply("testDBSIZE"));

    client.dbsize(function (err, value) {
        if (err) assert.fail(err, "testDBSIZE");
        checkEqual(value, 2, "testDBSIZE");
    });
}

function testEXPIRE() {
    // set 'foo' to expire in 2 seconds

    client.set('foo', 'bar', expectTrueReply("testEXPIRE"));
    client.expire('foo', 2, expectNumericReply(1, "testEXPIRE"));

    // subsequent expirations cannot be set.

    client.expire('foo', 2, expectNumericReply(0, "testEXPIRE"));

    setTimeout(function () {
        client.exists('foo', expectNumericReply(0, "testEXPIRE"));
    }, 2500);
}

function testTTL() {
    client.set('foo', 'bar', expectTrueReply("testTTL"));

    // foo is not set to expire

    client.ttl('foo', function (err, value) {
        if (err) assert.fail(err, "testTTL");
        checkEqual(value, -1, "testTTL");
    });

    client.set('bar', 'baz', expectTrueReply("testTTL"));
    client.expire('bar', 3, expectNumericReply(1, "testTTL"));

    client.ttl('bar', function (err, value) {
        if (err) assert.fail(err, "testTTL");
        check(value > 0, "testTTL");
    });
}

function testRPUSH() {
    client.rpush('list0', 'list0value0', expectNumericReply(1, "testRPUSH"));
    client.exists('list0', expectNumericReply(1, "testRPUSH"));
}

function testLPUSH() {
    client.exists('list1', expectNumericReply(0, "testLPUSH"));
    client.lpush('list1', 'list1value0', expectNumericReply(1, "testLPUSH"));
    client.exists('list1', expectNumericReply(1, "testLPUSH"));
}

function testLLEN() {
    client.rpush('list0', 'list0value0', expectNumericReply(1, "testLLEN"));
    client.llen('list0', expectNumericReply(1, "testLLEN"));

    client.rpush('list0', 'list0value1', expectNumericReply(2, "testLLEN"));
    client.llen('list0', expectNumericReply(2, "testLLEN"));
}

function testLRANGE() {
    client.rpush('list0', 'list0value0', expectNumericReply(1, "testLRANGE"));
    client.rpush('list0', 'list0value1', expectNumericReply(2, "testLRANGE"));

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
    client.rpush('list0', 'list0value0', expectNumericReply(1, "testLTRIM"));
    client.rpush('list0', 'list0value1', expectNumericReply(2, "testLTRIM"));
    client.rpush('list0', 'list0value2', expectNumericReply(3, "testLTRIM"));

    client.llen('list0', function (err, len) {
        if (err) assert.fail(err, "testLTRIM");
        checkEqual(len, 3, "testLTRIM");
    });

    client.ltrim('list0', 0, 1, expectTrueReply("testLTRIM"))

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
    client.rpush('list0', 'list0value0', expectNumericReply(1, "testLINDEX"));
    client.rpush('list0', 'list0value1', expectNumericReply(2, "testLINDEX"));

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
    client.rpush('list0', 'list0value0', expectNumericReply(1, "testLSET"));
    client.lset('list0', 0, 'LIST0VALUE0', expectTrueReply("testLSET"));

    client.lrange('list0', 0, 0, function (err, values) {
        if (err) assert.fail(err, "testLSET");
        checkEqual(values.length, 1, "testLSET");
        checkEqual(values[0], 'LIST0VALUE0', "testLSET");
    });
}

function testLREM() {
    client.lpush('list0', 'ABC', expectNumericReply(1, "testLREM"));
    client.lpush('list0', 'DEF', expectNumericReply(2, "testLREM"));
    client.lpush('list0', 'ABC', expectNumericReply(3, "testLREM"));

    client.lrem('list0', 1, 'ABC', expectNumericReply(1, "testLREM"));

    client.lrange('list0', 0, -1, function (err, values) {
        if (err) assert.fail(err, "testLREM");
        checkEqual(values.length, 2, "testLREM");
        checkEqual(values[0], 'DEF', "testLREM");
        checkEqual(values[1], 'ABC', "testLREM");
    });
}

function testLPOP() {
    client.lpush('list0', 'ABC', expectNumericReply(1, "testLPOP"));
    client.lpush('list0', 'DEF', expectNumericReply(2, "testLPOP"));
    client.lpush('list0', 'GHI', expectNumericReply(3, "testLPOP"));

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
    client.lpush('list0', 'ABC', expectNumericReply(1, "testRPOP"));
    client.lpush('list0', 'DEF', expectNumericReply(2, "testRPOP"));

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
    client.rpush('src', 'ABC', expectNumericReply(1, "testRPOPLPUSH"));
    client.rpush('src', 'DEF', expectNumericReply(2, "testRPOPLPUSH"));

    client.rpoplpush('src', 'dst', function (err, value) {
        if (err) assert.fail(err, "testRPOPLPUSH");
        checkEqual(value, 'DEF', "testRPOPLPUSH");

        client.lrange('src', 0, -1, function (err, values) {
            if (err) assert.fail(err, "testRPOPLPUSH");
            checkDeepEqual(values, [ 'ABC' ], "testRPOPLPUSH");
        });

        client.lrange('dst', 0, -1, function (err, values) {
            if (err) assert.fail(err, "testRPOPLPUSH");
            checkDeepEqual(values, [ 'DEF' ], "testRPOPLPUSH");
        });
    });
}

function testSADD() {
    client.sadd('set0', 'member0', expectNumericReply(1, "testSADD"));
    client.sadd('set0', 'member0', expectNumericReply(0, "testSADD")); // already member
}

function testSISMEMBER() {
    client.sadd('set0', 'member0', expectNumericReply(1, "testSISMEMBER"));
    client.sismember('set0', 'member0', expectNumericReply(1, "testSISMEMBER"));
    client.sismember('set0', 'member1', expectNumericReply(0, "testSISMEMBER"));
}

function testSCARD() {
    client.sadd('set0', 'member0', expectNumericReply(1, "testSCARD"));
    client.scard('set0', expectNumericReply(1, "testSCARD"));

    client.sadd('set0', 'member1', expectNumericReply(1, "testSCARD"));
    client.scard('set0', expectNumericReply(2, "testSCARD"));
}

function testSREM() {
    client.sadd('set0', 'member0', expectNumericReply(1, "testSREM"));
    client.srem('set0', 'foobar', expectNumericReply(0, "testSREM"))
    client.srem('set0', 'member0', expectNumericReply(1, "testSREM"))
    client.scard('set0', expectNumericReply(0, "testSREM"));
}

function testSPOP() {
    client.sadd('zzz', 'member0', expectNumericReply(1, "testSPOP"));
    client.scard('zzz', expectNumericReply(1, "testSPOP"));

    client.spop('zzz', function (err, value) {
        if (err) assert.fail(err, "testSPOP");
        checkEqual(value, 'member0', "testSPOP");
        client.scard('zzz', expectNumericReply(0, "testSPOP"));
    });
}

function testSDIFF() {
    client.sadd('foo', 'x', expectNumericReply(1, "testSDIFF"));
    client.sadd('foo', 'a', expectNumericReply(1, "testSDIFF"));
    client.sadd('foo', 'b', expectNumericReply(1, "testSDIFF"));
    client.sadd('foo', 'c', expectNumericReply(1, "testSDIFF"));

    client.sadd('bar', 'c', expectNumericReply(1, "testSDIFF"));

    client.sadd('baz', 'a', expectNumericReply(1, "testSDIFF"));
    client.sadd('baz', 'd', expectNumericReply(1, "testSDIFF"));

    client.sdiff('foo', 'bar', 'baz', function (err, values) {
        if (err) assert.fail(err, "testSDIFF");
        values.sort();
        checkEqual(values.length, 2, "testSDIFF");
        checkEqual(values[0], 'b', "testSDIFF");
        checkEqual(values[1], 'x', "testSDIFF");
    });
}

function testSDIFFSTORE() {
    client.sadd('foo', 'x', expectNumericReply(1, "testSDIFFSTORE"))
    client.sadd('foo', 'a', expectNumericReply(1, "testSDIFFSTORE"))
    client.sadd('foo', 'b', expectNumericReply(1, "testSDIFFSTORE"))
    client.sadd('foo', 'c', expectNumericReply(1, "testSDIFFSTORE"))

    client.sadd('bar', 'c', expectNumericReply(1, "testSDIFFSTORE"))

    client.sadd('baz', 'a', expectNumericReply(1, "testSDIFFSTORE"))
    client.sadd('baz', 'd', expectNumericReply(1, "testSDIFFSTORE"))

    // NB: SDIFFSTORE returns the number of elements in the dstkey 

    client.sdiffstore('quux', 'foo', 'bar', 'baz', expectNumericReply(2, "testSDIFFSTORE"))

    client.smembers('quux', function (err, members) {
        if (err) assert.fail(err, "testSDIFFSTORE");
        members.sort();
        checkDeepEqual(members, [ 'b', 'x' ], "testSDIFFSTORE");
    });
}

function testSMEMBERS() {
    client.sadd('foo', 'x', expectNumericReply(1, "testSMEMBERS"));

    client.smembers('foo', function (err, members) {
        if (err) assert.fail(err, "testSMEMBERS");
        checkDeepEqual(members, [ 'x' ], "testSMEMBERS");
    });

    client.sadd('foo', 'y', expectNumericReply(1, "testSMEMBERS"));

    client.smembers('foo', function (err, members) {
        if (err) assert.fail(err, "testSMEMBERS");
        checkEqual(members.length, 2, "testSMEMBERS");
        checkDeepEqual(members.sort(), [ 'x', 'y' ], "testSMEMBERS");
    });
}

function testSMOVE() {
    client.sadd('foo', 'x', expectNumericReply(1, "testSMOVE"));
    client.smove('foo', 'bar', 'x', expectNumericReply(1, "testSMOVE"));
    client.sismember('foo', 'x', expectNumericReply(0, "testSMOVE"));
    client.sismember('bar', 'x', expectNumericReply(1, "testSMOVE"));
    client.smove('foo', 'bar', 'x', expectNumericReply(0, "testSMOVE"));
}

function testSINTER() {
    client.sadd('sa', 'a', expectNumericReply(1, "testSINTER"));
    client.sadd('sa', 'b', expectNumericReply(1, "testSINTER"));
    client.sadd('sa', 'c', expectNumericReply(1, "testSINTER"));

    client.sadd('sb', 'b', expectNumericReply(1, "testSINTER"));
    client.sadd('sb', 'c', expectNumericReply(1, "testSINTER"));
    client.sadd('sb', 'd', expectNumericReply(1, "testSINTER"));

    client.sadd('sc', 'c', expectNumericReply(1, "testSINTER"));
    client.sadd('sc', 'd', expectNumericReply(1, "testSINTER"));
    client.sadd('sc', 'e', expectNumericReply(1, "testSINTER"));

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
    client.sadd('sa', 'a', expectNumericReply(1, "testSINTERSTORE"));
    client.sadd('sa', 'b', expectNumericReply(1, "testSINTERSTORE"));
    client.sadd('sa', 'c', expectNumericReply(1, "testSINTERSTORE"));

    client.sadd('sb', 'b', expectNumericReply(1, "testSINTERSTORE"));
    client.sadd('sb', 'c', expectNumericReply(1, "testSINTERSTORE"));
    client.sadd('sb', 'd', expectNumericReply(1, "testSINTERSTORE"));

    client.sadd('sc', 'c', expectNumericReply(1, "testSINTERSTORE"));
    client.sadd('sc', 'd', expectNumericReply(1, "testSINTERSTORE"));
    client.sadd('sc', 'e', expectNumericReply(1, "testSINTERSTORE"));

    client.sinterstore('foo', 'sa', 'sb', 'sc', expectNumericReply(1, "testSINTERSTORE"))

    client.smembers('foo', function (err, members) {
        if (err) assert.fail(err, "testSINTERSTORE");
        checkDeepEqual(members, [ 'c' ], "testSINTERSTORE");
    });
}

function testSUNION() {
    client.sadd('sa', 'a', expectNumericReply(1, "testUNION"));
    client.sadd('sa', 'b', expectNumericReply(1, "testUNION"));
    client.sadd('sa', 'c', expectNumericReply(1, "testUNION"));

    client.sadd('sb', 'b', expectNumericReply(1, "testUNION"));
    client.sadd('sb', 'c', expectNumericReply(1, "testUNION"));
    client.sadd('sb', 'd', expectNumericReply(1, "testUNION"));

    client.sadd('sc', 'c', expectNumericReply(1, "testUNION"));
    client.sadd('sc', 'd', expectNumericReply(1, "testUNION"));
    client.sadd('sc', 'e', expectNumericReply(1, "testUNION"));

    client.sunion('sa', 'sb', 'sc', function (err, union) {
        if (err) assert.fail(err, "testUNION");
        checkDeepEqual(union.sort(), ['a', 'b', 'c', 'd', 'e'], "testUNION");
    });
}

function testSUNIONSTORE() {
    client.sadd('sa', 'a', expectNumericReply(1, "testUNIONSTORE"));
    client.sadd('sa', 'b', expectNumericReply(1, "testUNIONSTORE"));
    client.sadd('sa', 'c', expectNumericReply(1, "testUNIONSTORE"));

    client.sadd('sb', 'b', expectNumericReply(1, "testUNIONSTORE"));
    client.sadd('sb', 'c', expectNumericReply(1, "testUNIONSTORE"));
    client.sadd('sb', 'd', expectNumericReply(1, "testUNIONSTORE"));

    client.sadd('sc', 'c', expectNumericReply(1, "testUNIONSTORE"));
    client.sadd('sc', 'd', expectNumericReply(1, "testUNIONSTORE"));
    client.sadd('sc', 'e', expectNumericReply(1, "testUNIONSTORE"));

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
    client.sadd('sa', 'a', expectNumericReply(1, "testTYPE"));
    client.type('sa', function (err, type) {
        if (err) assert.fail(err, "testTYPE");
        checkEqual(type, 'set', "testTYPE");
    });

    client.rpush('list0', 'x', expectNumericReply(1, "testTYPE"));
    client.type('list0', function (err, type) {
        if (err) assert.fail(err, "testTYPE");
        checkEqual(type, 'list', "testTYPE");
    });

    client.set('foo', 'bar', expectTrueReply("testTYPE"));
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
    client.rpush('list0', 'x', expectNumericReply(1, "testMOVE"));
    client.move('list0', TEST_DB_NUMBER_FOR_MOVE, expectNumericReply(1, "testMOVE"));

    client.select(TEST_DB_NUMBER_FOR_MOVE, expectTrueReply("testMOVE"));
    client.exists('list0', expectNumericReply(1, "testMOVE"));

    client.select(TEST_DB_NUMBER, expectTrueReply("testMOVE"));
    client.exists('list0', expectNumericReply(0, "testMOVE"));
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
    client.rpush('y', 'd', expectNumericReply(1, "testSORT"));
    client.rpush('y', 'b', expectNumericReply(2, "testSORT"));
    client.rpush('y', 'a', expectNumericReply(3, "testSORT"));
    client.rpush('y', 'c', expectNumericReply(4, "testSORT"));

    client.rpush('x', '3', expectNumericReply(1, "testSORT"));
    client.rpush('x', '9', expectNumericReply(2, "testSORT"));
    client.rpush('x', '2', expectNumericReply(3, "testSORT"));
    client.rpush('x', '4', expectNumericReply(4, "testSORT"));

    client.set('w3', '4', expectTrueReply("testSORT"));
    client.set('w9', '5', expectTrueReply("testSORT"));
    client.set('w2', '12', expectTrueReply("testSORT"));
    client.set('w4', '6', expectTrueReply("testSORT"));

    client.set('o2', 'buz', expectTrueReply("testSORT"));
    client.set('o3', 'foo', expectTrueReply("testSORT"));
    client.set('o4', 'baz', expectTrueReply("testSORT"));
    client.set('o9', 'bar', expectTrueReply("testSORT"));

    client.set('p2', 'qux', expectTrueReply("testSORT"));
    client.set('p3', 'bux', expectTrueReply("testSORT"));
    client.set('p4', 'lux', expectTrueReply("testSORT"));
    client.set('p9', 'tux', expectTrueReply("testSORT"));

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

        client.lrange('bacon', 0, -1, function (err, values) {
            if (err) assert.fail(err, "testSORT");
            checkDeepEqual(values, ['foo', 'bux', 'bar', 'tux', 'baz', 'lux', 'buz', 'qux'], "testSORT");
        });
    });
}

function testSAVE() {
    client.save(expectTrueReply("testSAVE"));
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

    client.mset('a', 'b', 'c', 'd', 'e', 100, expectTrueReply("testMSET"));
}

function testMSETNX() {
    client.mset('a', 'b', 'c', 'd', 'e', 100, expectTrueReply("testMSET"));

    // should fail since as 'a' already exists.

    client.msetnx('g', 'h', 'a', 'i', expectNumericReply(0, "testMSETNX"));

    // should pass as key 'g' was NOT set in prev. command
    // since it failed due to key 'a' already existing.

    client.msetnx('g', 'h', 'i', 'j', expectNumericReply(1, "testMSETNX"));
}

function testZADD() {
    client.zadd('z0', 100, 'm0', expectNumericReply(1, "testZADD"));

    // Already added m0; just update the score to 50.
    // Redis returns 0 in this case.

    client.zadd('z0', 50, 'm0', expectNumericReply(0, "testZADD"));
}

function testZREM() {
    client.zadd('z0', 100, 'm0', expectNumericReply(1, "testZREM"));
    client.zrem('z0', 'm0', expectNumericReply(1, "testZREM"));
    client.zrem('z0', 'm0', expectNumericReply(0, "testZREM"));
}

function testZCARD() {
    client.zcard('zzzzzz', expectNumericReply(0, "testZCARD")); // doesn't exist.

    client.zadd('z0', 100, 'm0', expectNumericReply(1, "testZCARD"));
    client.zadd('z0', 200, 'm1', expectNumericReply(1, "testZCARD"));

    client.zcard('z0', expectNumericReply(2, "testZCARD"));
}

function testZSCORE() {
    client.zadd('z0', 100, 'm0', expectNumericReply(1, "testZSCORE"));
    client.zadd('z0', 200, 'm1', expectNumericReply(1, "testZSCORE"));

    client.zscore('z0', 'm0', expectNumericReply(100, "testZSCORE"));
    client.zscore('z0', 'm1', expectNumericReply(200, "testZSCORE"));

    client.zscore('z0', 'zzzzzzz', function (err, score) {
        if (err) assert.fail(err, "testZSCORE");
        checkEqual(score, null, "testZSCORE");
    });
}

function testZRANGE() {
    client.zadd('z0', 100, 'm0', expectNumericReply(1, "testZRANGE"));
    client.zadd('z0', 200, 'm1', expectNumericReply(1, "testZRANGE"));
    client.zadd('z0', 300, 'm2', expectNumericReply(1, "testZRANGE"));

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
    client.zadd('z0', 100, 'm0', expectNumericReply(1, "testZREVRANGE"));
    client.zadd('z0', 200, 'm1', expectNumericReply(1, "testZREVRANGE"));
    client.zadd('z0', 300, 'm2', expectNumericReply(1, "testZREVRANGE"));

    client.zrevrange('z0', 0, 1000, function (err, members) {
        if (err) assert.fail(err, "testZREVRANGE");
        checkDeepEqual(members, [ 'm2', 'm1', 'm0' ], "testZREVRANGE");
    });
}

function testZRANGEBYSCORE() {
    client.zadd('z0', 100, 'm0', expectNumericReply(1, "testZRANGEBYSCORE"));
    client.zadd('z0', 200, 'm1', expectNumericReply(1, "testZRANGEBYSCORE"));
    client.zadd('z0', 300, 'm2', expectNumericReply(1, "testZRANGEBYSCORE"));

    client.zrangebyscore('z0', 200, 300, function (err, members) {
        if (err) assert.fail(err, "testZRANGEBYSCORE");
        checkDeepEqual(members, [ 'm1', 'm2' ], "testZRANGEBYSCORE");
    });

    client.zrangebyscore('z0', 100, 1000, function (err, members) {
        if (err) assert.fail(err, "testZRANGEBYSCORE");
        checkDeepEqual(members, [ 'm0', 'm1', 'm2' ], "testZRANGEBYSCORE");
    });

    client.zrangebyscore('z0', 10000, 100000, function (err, members) {
        if (err) assert.fail(err, "testZRANGEBYSCORE");
        checkEqual(members.length, 0, "testZRANGEBYSCORE");
    });
}

// zcount is undocumented as of Thu Apr 01 20:17:58 EDT 2010 
// zcount key startScore endScore => number of elements in [startScore, endScore]

function testZCOUNT() {
    client.zcount('z0', 0, 100, expectNumericReply(0, "testZCOUNT"));

    client.zadd('z0', 1, 'a', expectNumericReply(1, "testZCOUNT"));
    client.zcount('z0', 0, 100, expectNumericReply(1, "testZCOUNT"));

    client.zadd('z0', 2, 'b', expectNumericReply(1, "testZCOUNT"));
    client.zcount('z0', 0, 100, expectNumericReply(2, "testZCOUNT"));
}

function testZINCRBY() {
    client.zadd('z0', 1, 'a', expectNumericReply(1, "testZINCRBY"));
    client.zincrby('z0', 1, 'a', expectNumericReply(2, "testZINCRBY"));
}

// This really should be called ZINTERSTORE.

function testZINTER() {
    client.zadd('z0', 1, 'a', expectNumericReply(1, "testZINTER"));
    client.zadd('z0', 2, 'b', expectNumericReply(1, "testZINTER"));
    client.zadd('z1', 3, 'a', expectNumericReply(1, "testZINTER"));
    client.zinter('z2', 2, 'z0', 'z1', 'AGGREGATE', 'SUM', expectNumericReply(1, "testZINTER"));
    client.zrange('z2', 0, -1, 'WITHSCORES', function (err, members) {
        if (err) assert.fail(err, "testZINTER");
        checkDeepEqual(members, [ 'a', 4 ], "testZINTER");    // score=1+3
    });
}

function testZUNION() {
    client.zadd('z0', 1, 'a', expectNumericReply(1, "testZUNION"));
    client.zadd('z0', 2, 'b', expectNumericReply(1, "testZUNION"));
    client.zadd('z1', 3, 'a', expectNumericReply(1, "testZUNION"));
    client.zunion('z2', 2, 'z0', 'z1', 'AGGREGATE', 'SUM', expectNumericReply(2, "testZUNION"));
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
    client.zadd('z0', 1, 'a', expectNumericReply(1, "testZRANK"));
    client.zadd('z0', 2, 'b', expectNumericReply(1, "testZRANK"));
    client.zadd('z0', 3, 'c', expectNumericReply(1, "testZRANK"));

    client.zrank('z0', 'a', expectNumericReply(0, "testZRANK"));
    client.zrank('z0', 'b', expectNumericReply(1, "testZRANK"));
    client.zrank('z0', 'c', expectNumericReply(2, "testZRANK"));
}

function testZREVRANK() {
    client.zadd('z0', 1, 'a', expectNumericReply(1, "testZREVRANK"));
    client.zadd('z0', 2, 'b', expectNumericReply(1, "testZREVRANK"));
    client.zadd('z0', 3, 'c', expectNumericReply(1, "testZREVRANK"));

    client.zrevrank('z0', 'a', expectNumericReply(2, "testZREVRANK"));
    client.zrevrank('z0', 'b', expectNumericReply(1, "testZREVRANK"));
    client.zrevrank('z0', 'c', expectNumericReply(0, "testZREVRANK"));
}

function testZREMRANGEBYRANK() {
    client.zadd('z0', 1, 'a', expectNumericReply(1, "testZREMRANGEBYRANK"));
    client.zadd('z0', 2, 'b', expectNumericReply(1, "testZREMRANGEBYRANK"));
    client.zadd('z0', 3, 'c', expectNumericReply(1, "testZREMRANGEBYRANK"));

    client.zremrangebyrank('z0', -1, -1, expectNumericReply(1, "testZREMRANGEBYRANK"));

    client.zrange('z0', 0, -1, 'WITHSCORES', function (err, members) {
        if (err) assert.fail(err, "testZREMRANGEBYRANK");
        check(members.length % 2 == 0, "testZREMRANGEBYRANK");
        var set = {};
        for (var i=0; i<members.length; i += 2)
            set[members[i]] = members[i + 1];
        checkDeepEqual({ a:1, b:2 }, set, "testZREMRANGEBYRANK");
    });
}

function testZREMRANGEBYSCORE() {
    client.zadd('z0', 1, 'a', expectNumericReply(1, "testZREMRANGEBYSCORE"));
    client.zadd('z0', 2, 'b', expectNumericReply(1, "testZREMRANGEBYSCORE"));
    client.zadd('z0', 3, 'c', expectNumericReply(1, "testZREMRANGEBYSCORE"));

    // inclusive
    client.zremrangebyscore('z0', 2, 3, expectNumericReply(2, "testZREMRANGEBYSCORE"));

    client.zrange('z0', 0, -1, 'WITHSCORES', function (err, members) {
        if (err) assert.fail(err, "testZREMRANGEBYSCORE");
        check(members.length % 2 == 0, "testZREMRANGEBYSCORE");
        var set = {};
        for (var i=0; i<members.length; i += 2)
            set[members[i]] = members[i + 1];
        checkDeepEqual({ a:1 }, set, "testZREMRANGEBYSCORE");
    });
}

function testHDEL() {
    client.hset("foo", "bar", "baz", expectNumericReply(1, "testHDEL"));
    client.hdel("foo", "bar", expectNumericReply(1, "testHDEL"));
    client.hdel("foo", "bar", expectNumericReply(0, "testHDEL"));
}

function testHEXISTS() {
    client.hset("foo", "bar", "baz", expectNumericReply(1, "testHEXISTS"));
    client.hexists("foo", "bar", expectNumericReply(1, "testHEXISTS"));
    client.hexists("foo", "baz", expectNumericReply(0, "testHEXISTS"));
}

function testHGET() {
    client.hset("foo", "bar", "baz", expectNumericReply(1, "testHGET"));
    client.hget("foo", "bar", function (err, reply) {
        if (err) assert.fail(err, "testHGET");
        checkEqual("baz", reply, "testHGET");
    });
}

function testHGETALL() {
    client.hset("foo", "bar", "baz", expectNumericReply(1, "testHGETALL"));
    client.hset("foo", "quux", "doo", expectNumericReply(1, "testHGETALL"));
    client.hgetall("foo", function (err, reply) {
        if (err) assert.fail(err, "testHGETALL");
        checkDeepEqual({ bar:"baz", quux:"doo" }, reply, "testHGETALL");
    });
}

function testHINCRBY() {
    client.hincrby("foo", "bar", 1, expectNumericReply(1, "testHINCRBY"));
    client.hget("foo", "bar", expectNumericReply(1, "testHINCRBY"));

    client.hincrby("foo", "bar", 1, expectNumericReply(2, "testHINCRBY"));
    client.hget("foo", "bar", expectNumericReply(2, "testHINCRBY"));
}

function testHKEYS() {
    client.hset("foo", "bar", "baz", expectNumericReply(1, "testHKEYS"));
    client.hset("foo", "quux", "doo", expectNumericReply(1, "testHKEYS"));
    client.hkeys("foo", function (err, reply) {
        if (err) assert.fail(err, "testHKEYS");
        checkDeepEqual([ "bar", "quux" ], reply.sort(), "testHKEYS");
    });
}

function testHVALS() {
    client.hset("foo", "bar", "baz", expectNumericReply(1, "testHVALS"));
    client.hset("foo", "quux", "doo", expectNumericReply(1, "testHVALS"));
    client.hvals("foo", function (err, reply) {
        if (err) assert.fail(err, "testHVALS");
        checkDeepEqual([ "baz", "doo" ], reply.sort(), "testHVALS");
    });
}

function testHLEN() {
    client.hlen("foo", expectNumericReply(0, "testHLEN"));
    client.hset("foo", "bar", "baz", expectNumericReply(1, "testHLEN"));
    client.hlen("foo", expectNumericReply(1, "testHLEN"));
    client.hset("foo", "quux", "doo", expectNumericReply(1, "testHLEN"));
    client.hlen("foo", expectNumericReply(2, "testHLEN"));
}

function testHSET() {
    client.hset("foo", "bar", "baz", expectNumericReply(1, "testHSET"));
    client.hget("foo", "bar", function (err, reply) {
        if (err) assert.fail(err, "testHSET");
        checkEqual("baz", reply, "testHSET");
    });
}

function testPSUBSCRIBE() {
    // TODO code me
}

function testPUBLISH() {
    // TODO code me
}

function testPUNSUBSCRIBE() {
    // TODO code me
}

function testSUBSCRIBE() {
    // TODO code me
}

function testUNSUBSCRIBE() {
    // TODO code me
}

// We cannot test the blocking behavior of BLPOP and BRPOP from a single client
// without using a timeout.  That being said, we can test the non-blocking
// behavior by ensuring there's an element in a list that we try to pop from.

function testBLPOP() {
    var timeout = 1;

    // Non-blocking against a single key.

    client.lpush('list0', 'ABC', expectNumericReply(1, "testBLPOP"));
    client.blpop('list0', timeout, function (err, reply) {
        if (err) assert.fail(err, "testBLPOP");
        checkDeepEqual([ "list0", "ABC" ], reply, "testBLPOP");
    });

    // Non-blocking against multiple keys.
    // Returns the first one that has something in it.

    client.lpush('list0', 'ABC', expectNumericReply(1, "testBLPOP"));
    client.blpop('list1', 'list0', timeout, function (err, reply) {
        if (err) assert.fail(err, "testBLPOP");
        checkDeepEqual([ "list0", "ABC" ], reply, "testBLPOP");
    });

    // Non-blocking against a single key that does not exist.
    // This should timeout after 1 second and return a null reply.

    client.blpop('listX', timeout, function (err, reply) {
        if (err) assert.fail(err, "testBLPOP");
        checkEqual(null, reply, "testBLPOP");
    });
}

function testBRPOP() {
    var timeout = 1;

    // Non-blocking against a single key.

    client.lpush('list0', 'ABC', expectNumericReply(1, "testBRPOP"));
    client.lpush('list0', 'DEF', expectNumericReply(2, "testBRPOP"));
    client.brpop('list0', timeout, function (err, reply) {
        if (err) assert.fail(err, "testBRPOP");
        checkDeepEqual([ "list0", "ABC" ], reply, "testBRPOP");
    });

    // Non-blocking against multiple keys.
    // Returns the first one that has something in it.

    client.lpush('list0', 'ABC', expectNumericReply(2, "testBRPOP"));
    client.brpop('list1', 'list0', timeout, function (err, reply) {
        if (err) assert.fail(err, "testBRPOP");
        checkDeepEqual([ "list0", "DEF" ], reply, "testBRPOP");
    });

    // Non-blocking against a single key that does not exist.
    // This should timeout after 1 second and return a null reply.

    client.brpop('listX', timeout, function (err, reply) {
        if (err) assert.fail(err, "testBRPOP");
        checkEqual(null, reply, "testBRPOP");
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
        sys.debug("all tests have passed.");
        process.exit(0);
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

