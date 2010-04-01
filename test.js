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

// Redis' protocol returns +OK for some operations.
// The client converts this into a ECMAScript boolean type with value true.

function expectTrueReply(context) {
    return function (err, reply) {
        if (err) assert.fail(err, context);
        assert.equal(typeof(reply), 'boolean', context);
        assert.ok(reply, context);
    };
}

function expectNumericReply(expectedValue, context) {
    return function (err, reply) {
        if (err) assert.fail(err, context);
        assert.equal('number', typeof(reply), context);
        assert.equal(expectedValue, reply, context);
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
    assert.equal(reply, "FOOBAR", "testParseBulkReply");

    var b = "$-1\r\n";
    client.readBuffer = b;
    reply = client.parseBulkReply();
    assert.equal(reply, null, "testParseBulkReply");

    var c = "$-1\r";     // NB: partial command, missing \n
    client.readBuffer = c;
    reply = client.parseBulkReply();
    assert.ok(reply instanceof redisclient.PartialReply, "testParseBulkReply");
}

function testParseMultiBulkReply() {
    var a = "*4\r\n$3\r\nFOO\r\n$3\r\nBAR\r\n$5\r\nHELLO\r\n$5\r\nWORLD\r\n";
    client.readBuffer = a;
    var reply = client.parseMultiBulkReply();
    assert.ok(reply instanceof Array, "testParseMultiBulkReply");
    assert.equal(reply.length, 4, "testParseMultiBulkReply");
    assert.deepEqual(reply, ['FOO', 'BAR', 'HELLO', 'WORLD'], "testParseMultiBulkReply");

    var b = "$-1\r\n";
    client.readBuffer = b;
    reply = client.parseMultiBulkReply();
    assert.equal(reply, null, "testParseMultiBulkReply");

    var c = "*3\r\n$3\r\nFOO\r\n$-1\r\n$4\r\nBARZ\r\n";
    client.readBuffer = c;
    reply = client.parseMultiBulkReply();
    assert.equal(reply.length, 3, "testParseMultiBulkReply");
    assert.deepEqual(reply, ['FOO', null, 'BARZ'], "testParseMultiBulkReply");
}

function testParseInlineReply() {
    var a = "+OK\r\n";
    client.readBuffer = a;
    var reply = client.parseInlineReply();
    assert.equal(typeof(reply), 'boolean', "testParseInlineReply");
    assert.equal(true, reply, "testParseInlineReply");

    var b = "+WHATEVER\r\n";
    client.readBuffer = b;
    reply = client.parseInlineReply();
    assert.equal(typeof(reply), 'string', "testParseInlineReply");
    assert.equal('WHATEVER', reply, "testParseInlineReply");
}

function testParseIntegerReply() {
    var a = ":-1\r\n";
    client.readBuffer = a;
    var reply = client.parseIntegerReply();
    assert.equal(typeof(reply), 'number', "testParseIntegerReply");
    assert.equal(reply, -1, "testParseIntegerReply");

    var b = ":1000\r\n";
    client.readBuffer = b;
    reply = client.parseIntegerReply();
    assert.equal(typeof(reply), 'number', "testParseIntegerReply");
    assert.equal(reply, 1000, "testParseIntegerReply");
}

function testParseErrorReply() {
    var a = "-ERR solar flare\r\n";
    client.readBuffer = a;
    var reply = client.parseErrorReply();
    assert.equal(typeof(reply), 'string', "testParseErrorReply");
    assert.equal(reply, "ERR solar flare", "testParseErrorReply");

    var b = "-hiccup\r\n";
    client.readBuffer = b;
    reply = client.parseErrorReply();
    assert.equal(typeof(reply), 'string', "testParseErrorReply");
    assert.equal(reply, "hiccup", "testParseErrorReply");
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
        assert.equal(value, 'bar', "testGET");
    });

    client.get('baz', function (err, value) {
        if (err) assert.fail(err, "testGET");
        assert.equal(value, 'buz', "testGET");
    });
}

function testMGET() {
    client.set('foo', 'bar', expectTrueReply("testMGET"));
    client.set('baz', 'buz', expectTrueReply("testMGET"));

    client.mget('foo', 'baz', function (err, values) {
        if (err) assert.fail(err, "testMGET");
        assert.equal(values[0], 'bar', "testMGET");
        assert.equal(values[1], 'buz', "testMGET");
    });
}

function testGETSET() {
    client.set('foo', 'bar', expectTrueReply("testGETSET"));

    client.getset('foo', 'fuzz', function (err, previousValue) {
        if (err) assert.fail(err, "testGETSET");
        assert.equal(previousValue, 'bar', "testGETSET");

        client.get('foo', function (err, value) {
            if (err) assert.fail(err, "testGETSET");
            assert.equal(value, 'fuzz', "testGETSET");
        });
    });
}

function testSETANDGETMULTIBYTE() {
    var testValue = unescape('%F6');
    client.set('unicode', testValue, expectTrueReply("testSETANDGETMULTIBYTE"))

    client.get('unicode', function (err, value) {
        if (err) assert.fail(err, "testSETANDGETMULTIBYTE");
        assert.equal(value, testValue, "testSETANDGETMULTIBYTE");
    });
}

function testINFO() {
    client.info( function (err, info) {
        assert.ok(info instanceof Object, "testINFO");
        assert.ok(info.hasOwnProperty('redis_version'), "testINFO");
        assert.ok(info.hasOwnProperty('connected_clients'), "testINFO");
        assert.ok(info.hasOwnProperty('uptime_in_seconds'), "testINFO");
        assert.equal(typeof(info.uptime_in_seconds), 'number', "testINFO");
        assert.equal(typeof(info.connected_clients), 'number', "testINFO");
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
        assert.equal(keys.length, 2, "testKEYS");
        assert.deepEqual(keys.sort(), ['foo1', 'foo2'], "testKEYS");
    });

    client.set('baz', 'bazValue', expectTrueReply("testKEYS"))
    client.set('boo', 'booValue', expectTrueReply("testKEYS"))

    // At this point we have foo1, foo2, baz, boo

    client.keys('*', function (err, keys) {
        if (err) assert.fail(err, "testKEYS");
        assert.equal(keys.length, 4, "testKEYS");
        assert.deepEqual(keys.sort(), ['baz', 'boo', 'foo1', 'foo2'], "testKEYS");
    });

    client.keys('?oo', function (err, keys) {
        if (err) assert.fail(err, "testKEYS");
        assert.equal(keys.length, 1, "testKEYS");
        assert.deepEqual(keys.sort(), ['boo'], "testKEYS");
    });
}

function testRANDOMKEY() {
    client.set('foo', 'bar', expectTrueReply("testRANDOMKEY"));
    client.set('baz', 'buz', expectTrueReply("testRANDOMKEY"));

    client.randomkey(function (err, someKey) {
        if (err) assert.fail(err, "testRANDOMKEY");
        assert.ok(/^(foo|baz)$/.test(someKey), "testRANDOMKEY");
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
        assert.equal(value, 2, "testDBSIZE");
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
        assert.equal(value, -1, "testTTL");
    });

    client.set('bar', 'baz', expectTrueReply("testTTL"));
    client.expire('bar', 3, expectNumericReply(1, "testTTL"));

    client.ttl('bar', function (err, value) {
        if (err) assert.fail(err, "testTTL");
        assert.ok(value > 0, "testTTL");
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
        assert.equal(values.length, 2, "testLRANGE");
        assert.equal(values[0], 'list0value0', "testLRANGE");
        assert.equal(values[1], 'list0value1', "testLRANGE");
    });

    client.lrange('list0', 0, 0, function (err, values) {
        if (err) assert.fail(err, "testLRANGE");
        assert.equal(values.length, 1, "testLRANGE");
        assert.equal(values[0], 'list0value0', "testLRANGE");
    });

    client.lrange('list0', -1, -1, function (err, values) {
        if (err) assert.fail(err, "testLRANGE");
        assert.equal(values.length, 1, "testLRANGE");
        assert.equal(values[0], 'list0value1', "testLRANGE");
    });
}

function testLTRIM() {
    client.rpush('list0', 'list0value0', expectNumericReply(1, "testLTRIM"));
    client.rpush('list0', 'list0value1', expectNumericReply(2, "testLTRIM"));
    client.rpush('list0', 'list0value2', expectNumericReply(3, "testLTRIM"));

    client.llen('list0', function (err, len) {
        if (err) assert.fail(err, "testLTRIM");
        assert.equal(len, 3, "testLTRIM");
    });

    client.ltrim('list0', 0, 1, expectTrueReply("testLTRIM"))

    client.llen('list0', function (err, len) {
        if (err) assert.fail(err, "testLTRIM");
        assert.equal(len, 2, "testLTRIM");
    });

    client.lrange('list0', 0, -1, function (err, values) {
        if (err) assert.fail(err, "testLTRIM");
        assert.equal(values.length, 2, "testLTRIM");
        assert.equal(values[0], 'list0value0', "testLTRIM");
        assert.equal(values[1], 'list0value1', "testLTRIM");
    });
}

function testLINDEX() {
    client.rpush('list0', 'list0value0', expectNumericReply(1, "testLINDEX"));
    client.rpush('list0', 'list0value1', expectNumericReply(2, "testLINDEX"));

    client.lindex('list0', 0, function (err, value) {
        if (err) assert.fail(err, "testLINDEX");
        assert.equal(value, 'list0value0', "testLINDEX");
    });

    client.lindex('list0', 1, function (err, value) {
        if (err) assert.fail(err, "testLINDEX");
        assert.equal(value, 'list0value1', "testLINDEX");
    });

    // out of range => null

    client.lindex('list0', 2, function (err, value) {
        if (err) assert.fail(err, "testLINDEX");
        assert.equal(value, null, "testLINDEX");
    });
}

function testLSET() {
    client.rpush('list0', 'list0value0', expectNumericReply(1, "testLSET"));
    client.lset('list0', 0, 'LIST0VALUE0', expectTrueReply("testLSET"));

    client.lrange('list0', 0, 0, function (err, values) {
        if (err) assert.fail(err, "testLSET");
        assert.equal(values.length, 1, "testLSET");
        assert.equal(values[0], 'LIST0VALUE0', "testLSET");
    });
}

function testLREM() {
    client.lpush('list0', 'ABC', expectNumericReply(1, "testLREM"));
    client.lpush('list0', 'DEF', expectNumericReply(2, "testLREM"));
    client.lpush('list0', 'ABC', expectNumericReply(3, "testLREM"));

    client.lrem('list0', 1, 'ABC', expectNumericReply(1, "testLREM"));

    client.lrange('list0', 0, -1, function (err, values) {
        if (err) assert.fail(err, "testLREM");
        assert.equal(values.length, 2, "testLREM");
        assert.equal(values[0], 'DEF', "testLREM");
        assert.equal(values[1], 'ABC', "testLREM");
    });
}

function testLPOP() {
    client.lpush('list0', 'ABC', expectNumericReply(1, "testLPOP"));
    client.lpush('list0', 'DEF', expectNumericReply(2, "testLPOP"));
    client.lpush('list0', 'GHI', expectNumericReply(3, "testLPOP"));

    client.lpop('list0', function (err, value) {
        if (err) assert.fail(err, "testLPOP");
        assert.equal(value, 'GHI', "testLPOP");
    });

    client.lpop('list0', function (err, value) {
        if (err) assert.fail(err, "testLPOP");
        assert.equal(value, 'DEF', "testLPOP");
    });

    client.lrange('list0', 0, -1, function (err, values) {
        if (err) assert.fail(err, "testLPOP");
        assert.equal(values.length, 1, "testLPOP");
        assert.equal(values[0], 'ABC', "testLPOP");
    });
}

function testRPOP() {
    client.lpush('list0', 'ABC', expectNumericReply(1, "testRPOP"));
    client.lpush('list0', 'DEF', expectNumericReply(2, "testRPOP"));

    client.rpop('list0', function (err, value) {
        if (err) assert.fail(err, "testRPOP");
        assert.equal(value, 'ABC', "testRPOP");
    });

    client.rpop('list0', function (err, value) {
        if (err) assert.fail(err, "testRPOP");
        assert.equal(value, 'DEF', "testRPOP");
    });

    client.llen('list0', function (err, len) {
        if (err) assert.fail(err, "testRPOP");
        assert.equal(len, 0, "testRPOP");
    });
}

function testRPOPLPUSH() {
    client.rpush('src', 'ABC', expectNumericReply(1, "testRPOPLPUSH"));
    client.rpush('src', 'DEF', expectNumericReply(2, "testRPOPLPUSH"));

    client.rpoplpush('src', 'dst', function (err, value) {
        if (err) assert.fail(err, "testRPOPLPUSH");
        assert.equal(value, 'DEF', "testRPOPLPUSH");

        client.lrange('src', 0, -1, function (err, values) {
            if (err) assert.fail(err, "testRPOPLPUSH");
            assert.deepEqual(values, [ 'ABC' ], "testRPOPLPUSH");
        });

        client.lrange('dst', 0, -1, function (err, values) {
            if (err) assert.fail(err, "testRPOPLPUSH");
            assert.deepEqual(values, [ 'DEF' ], "testRPOPLPUSH");
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
        assert.equal(value, 'member0', "testSPOP");
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
        assert.equal(values.length, 2, "testSDIFF");
        assert.equal(values[0], 'b', "testSDIFF");
        assert.equal(values[1], 'x', "testSDIFF");
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
        assert.deepEqual(members, [ 'b', 'x' ], "testSDIFFSTORE");
    });
}

function testSMEMBERS() {
    client.sadd('foo', 'x', expectNumericReply(1, "testSMEMBERS"));

    client.smembers('foo', function (err, members) {
        if (err) assert.fail(err, "testSMEMBERS");
        assert.deepEqual(members, [ 'x' ], "testSMEMBERS");
    });

    client.sadd('foo', 'y', expectNumericReply(1, "testSMEMBERS"));

    client.smembers('foo', function (err, members) {
        if (err) assert.fail(err, "testSMEMBERS");
        assert.equal(members.length, 2, "testSMEMBERS");
        assert.deepEqual(members.sort(), [ 'x', 'y' ], "testSMEMBERS");
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
        assert.equal(intersection.length, 2, "testSINTER");
        assert.deepEqual(intersection.sort(), [ 'b', 'c' ], "testSINTER");
    });

    client.sinter('sb', 'sc', function (err, intersection) {
        if (err) assert.fail(err, "testSINTER");
        assert.equal(intersection.length, 2, "testSINTER");
        assert.deepEqual(intersection.sort(), [ 'c', 'd' ], "testSINTER");
    });

    client.sinter('sa', 'sc', function (err, intersection) {
        if (err) assert.fail(err, "testSINTER");
        assert.equal(intersection.length, 1, "testSINTER");
        assert.equal(intersection[0], 'c', "testSINTER");
    });

    // 3-way

    client.sinter('sa', 'sb', 'sc', function (err, intersection) {
        if (err) assert.fail(err, "testSINTER");
        assert.equal(intersection.length, 1, "testSINTER");
        assert.equal(intersection[0], 'c', "testSINTER");
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
        assert.deepEqual(members, [ 'c' ], "testSINTERSTORE");
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
        assert.deepEqual(union.sort(), ['a', 'b', 'c', 'd', 'e'], "testUNION");
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
        assert.equal(cardinality, 5, "testUNIONSTORE");
    });

    client.smembers('foo', function (err, members) {
        if (err) assert.fail(err, "testUNIONSTORE");
        assert.equal(members.length, 5, "testUNIONSTORE");
        assert.deepEqual(members.sort(), ['a', 'b', 'c', 'd', 'e'], "testUNIONSTORE");
    });
}

function testTYPE() {
    client.sadd('sa', 'a', expectNumericReply(1, "testTYPE"));
    client.type('sa', function (err, type) {
        if (err) assert.fail(err, "testTYPE");
        assert.equal(type, 'set', "testTYPE");
    });

    client.rpush('list0', 'x', expectNumericReply(1, "testTYPE"));
    client.type('list0', function (err, type) {
        if (err) assert.fail(err, "testTYPE");
        assert.equal(type, 'list', "testTYPE");
    });

    client.set('foo', 'bar', expectTrueReply("testTYPE"));
    client.type('foo', function (err, type) {
        if (err) assert.fail(err, "testTYPE");
        assert.equal(type, 'string', "testTYPE");
    });

    client.type('xxx', function (err, type) {
        if (err) assert.fail(err, "testTYPE");
        assert.equal(type, 'none', "testTYPE");
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
        assert.deepEqual(sorted, ['a', 'b', 'c', 'd'], "testSORT");
    });

    client.sort('y', 'desc', 'alpha', function (err, sorted) {
        if (err) assert.fail(err, "testSORT");
        assert.deepEqual(sorted, ['d', 'c', 'b', 'a'], "testSORT");
    });

    // Now try sorting numbers in a list.
    // x = [ 3, 9, 2, 4 ]

    client.sort('x', 'asc', function (err, sorted) {
        if (err) assert.fail(err, "testSORT");
        assert.deepEqual(sorted, [2, 3, 4, 9], "testSORT");
    });

    client.sort('x', 'desc', function (err, sorted) {
        if (err) assert.fail(err, "testSORT");
        assert.deepEqual(sorted, [9, 4, 3, 2], "testSORT");
    });

    // Try sorting with a 'by' pattern.

    client.sort('x', 'by', 'w*', 'asc', function (err, sorted) {
        if (err) assert.fail(err, "testSORT");
        assert.deepEqual(sorted, [3, 9, 4, 2], "testSORT");
    });

    // Try sorting with a 'by' pattern and 1 'get' pattern.

    client.sort('x', 'by', 'w*', 'asc', 'get', 'o*', function (err, sorted) {
        if (err) assert.fail(err, "testSORT");
        assert.deepEqual(sorted, ['foo', 'bar', 'baz', 'buz'], "testSORT");
    });

    // Try sorting with a 'by' pattern and 2 'get' patterns.

    client.sort('x', 'by', 'w*', 'asc', 'get', 'o*', 'get', 'p*', function (err, sorted) {
        if (err) assert.fail(err, "testSORT");
        assert.deepEqual(sorted, ['foo', 'bux', 'bar', 'tux', 'baz', 'lux', 'buz', 'qux'], "testSORT");
    });

    // Try sorting with a 'by' pattern and 2 'get' patterns.
    // Instead of getting back the sorted set/list, store the values to a list.
    // Then check that the values are there in the expected order.

    client.sort('x', 'by', 'w*', 'asc', 'get', 'o*', 'get', 'p*', 'store', 'bacon', function (err) {
        if (err) assert.fail(err, "testSORT");

        client.lrange('bacon', 0, -1, function (err, values) {
            if (err) assert.fail(err, "testSORT");
            assert.deepEqual(values, ['foo', 'bux', 'bar', 'tux', 'baz', 'lux', 'buz', 'qux'], "testSORT");
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
        assert.equal(typeof(value), 'number', "testLASTSAVE");
        assert.ok(value > 0, "testLASTSAVE");
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
        assert.equal(score, null, "testZSCORE");
    });
}

function testZRANGE() {
    client.zadd('z0', 100, 'm0', expectNumericReply(1, "testZRANGE"));
    client.zadd('z0', 200, 'm1', expectNumericReply(1, "testZRANGE"));
    client.zadd('z0', 300, 'm2', expectNumericReply(1, "testZRANGE"));

    client.zrange('z0', 0, 1000, function (err, members) {
        if (err) assert.fail(err, "testZRANGE");
        assert.deepEqual(members, [ 'm0', 'm1', 'm2' ], "testZRANGE");
    });

    client.zrange('z0', -1, -1, function (err, members) {
        if (err) assert.fail(err, "testZRANGE");
        assert.deepEqual(members, [ 'm2' ], "testZRANGE");
    });

    client.zrange('z0', -2, -1, function (err, members) {
        if (err) assert.fail(err, "testZRANGE");
        assert.deepEqual(members, [ 'm1', 'm2' ], "testZRANGE");
    });
}

function testZREVRANGE() {
    client.zadd('z0', 100, 'm0', expectNumericReply(1, "testZREVRANGE"));
    client.zadd('z0', 200, 'm1', expectNumericReply(1, "testZREVRANGE"));
    client.zadd('z0', 300, 'm2', expectNumericReply(1, "testZREVRANGE"));

    client.zrevrange('z0', 0, 1000, function (err, members) {
        if (err) assert.fail(err, "testZREVRANGE");
        assert.deepEqual(members, [ 'm2', 'm1', 'm0' ], "testZREVRANGE");
    });
}

function testZRANGEBYSCORE() {
    client.zadd('z0', 100, 'm0', expectNumericReply(1, "testZRANGEBYSCORE"));
    client.zadd('z0', 200, 'm1', expectNumericReply(1, "testZRANGEBYSCORE"));
    client.zadd('z0', 300, 'm2', expectNumericReply(1, "testZRANGEBYSCORE"));

    client.zrangebyscore('z0', 200, 300, function (err, members) {
        if (err) assert.fail(err, "testZRANGEBYSCORE");
        assert.deepEqual(members, [ 'm1', 'm2' ], "testZRANGEBYSCORE");
    });

    client.zrangebyscore('z0', 100, 1000, function (err, members) {
        if (err) assert.fail(err, "testZRANGEBYSCORE");
        assert.deepEqual(members, [ 'm0', 'm1', 'm2' ], "testZRANGEBYSCORE");
    });

    client.zrangebyscore('z0', 10000, 100000, function (err, members) {
        if (err) assert.fail(err, "testZRANGEBYSCORE");
        assert.equal(members.length, 0, "testZRANGEBYSCORE");
    });
}

var allTestFunctions = [
    testAUTH,
    testBGSAVE,
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
    testSUNION,
    testSUNIONSTORE,
    testTTL,
    testTYPE,
    testZADD,
    testZCARD,
    testZRANGE,
    testZRANGEBYSCORE,
    testZREM,
    testZREVRANGE,
    testZSCORE,
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

