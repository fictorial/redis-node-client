#!/usr/bin/env node

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

// NOTE: this test suite uses databases 14 and 15 for test purposes! It will
// **clear** these databases at the start of the test runs. If you want to
// use a different database number, update TEST_DB_NUMBER* below.

var TEST_DB_NUMBER = 15,
    TEST_DB_NUMBER_FOR_MOVE = 14;

var sys = require("sys"),
    test = require("mjsunit"),
    redisclient = require("./redisclient");

var pendingCallbacks = 0;

function expectCallback() {
    pendingCallbacks++;
}

function wasCalledBack() {
    pendingCallbacks--;
}

// Redis' protocol returns +OK for some operations.
// The client converts this into a ECMAScript boolean type with value true.
    
function expectTrueReply(error, reply) {
    expectCallback();
    if(!error) {
        test.assertEquals(typeof(reply), 'boolean');
        test.assertTrue(reply);
        wasCalledBack();
    } else {
        test.assertTrue(error);
    }
}

function expectFalse(error, reply) {
    expectCallback();
    if(!error) {
        test.assertEquals(typeof(reply), 'boolean');
        test.assertFalse(reply);
        wasCalledBack();
    } else {
        test.assertTrue(error);
    }
}

function expectNumericReply(expectedValue) {
    expectCallback();
    return function(error, reply) {
        if (!error) {
            test.assertEquals(typeof(reply), 'number');
            test.assertEquals(expectedValue, reply);
            wasCalledBack();
        } else {
            test.assertTrue(error);
        }
    }
}

function expectZeroAsReply(err, reply) {
    return expectNumericReply(0)(err, reply);
}

function expectOneAsReply(err, reply) {
    return expectNumericReply(1)(err, reply);
}

function testAuth() {
    // You need to configure redis to enable auth.    
    // This unit test suite assumes the auth feature is off/disabled.
    // Auth *would be* the first command required after connecting.
}

// Test functions start with 'test' and are listed here in executed order by
// convention. NOTE: the actual list of tests is *manually* specified at the
// bottom of this file.

function testSelect() {
    client.select(TEST_DB_NUMBER_FOR_MOVE, expectTrueReply);
    client.flushdb(expectTrueReply);
    client.select(TEST_DB_NUMBER, expectTrueReply);
    client.flushdb(expectTrueReply);
}

function testFlushdb() {
    // no-op; tested in testSelect
}

function testSet() {
    client.set('foo', 'bar', expectTrueReply)
    client.set('baz', 'buz', expectTrueReply)
}

function testSetnx() {
    client.setnx('foo', 'quux', expectZeroAsReply);    // fails when already set
    client.setnx('boo', 'apple', expectOneAsReply);    // no such key already so OK
}

function testGet() {
    expectCallback();
    client.get('foo', function (err, value) { 
        test.assertEquals(value, 'bar');
        wasCalledBack(); 
    });

    expectCallback();
    client.get('boo', function (err, value) { 
        test.assertEquals(value, 'apple'); 
        wasCalledBack();
    });
}

function testMget() {
    expectCallback();
    client.mget('foo', 'boo', function (err, values) { 
        test.assertEquals('bar', values[0]);
        test.assertEquals('apple', values[1]);
        wasCalledBack();
    });
}

function testGetset() {
    expectCallback();
    client.getset('foo', 'fuzz', function (err, previousValue) {
        test.assertEquals('bar', previousValue);
        wasCalledBack();
    });
}

function testSetAndGetMultibyte() {
    var testValue = unescape('%F6');
    client.set('unicode', testValue, expectTrueReply)
    expectCallback();
    client.get('unicode', function (err, value) { 
        test.assertEquals(testValue, value);
        wasCalledBack(); 
    });
}

function testInfo() {
    expectCallback();
    client.info( function (err, info) {
        test.assertInstanceof(info, Object);
        test.assertTrue(info.hasOwnProperty('redisVersion'));
        test.assertTrue(info.hasOwnProperty('connectedClients'));
        test.assertTrue(info.hasOwnProperty('uptimeInSeconds'));
        test.assertEquals(typeof(info.uptimeInSeconds), 'number');
        test.assertEquals(typeof(info.connectedClients), 'number');
        wasCalledBack();
    });
}

function testIncr() {
    client.incr('counter', expectNumericReply(1))
    client.incr('counter', expectNumericReply(2))
}

function testIncrby() {
    client.incrby('counter', '2', expectNumericReply(4))
    client.incrby('counter', '-1', expectNumericReply(3))
}

function testDecr() {
    client.decr('counter', expectNumericReply(2))
    client.decr('counter', expectNumericReply(1))
}

function testDecrby() {
    client.decrby('counter', '1', expectNumericReply(0))
    client.decrby('counter', '2', expectNumericReply(-2))
    client.decrby('counter', '-3', expectNumericReply(1))
}

function testExists() {
    client.exists('counter', expectOneAsReply)
    client.exists('counter:asdfasdf', expectZeroAsReply)
}

function testDel() {
    client.del('counter', expectOneAsReply)
    client.exists('counter', expectZeroAsReply)
}

function testKeys() {
    client.set('foo2', 'some value', expectTrueReply)

    expectCallback();
    client.keys('foo*', function (err, keys) {
        test.assertEquals(keys.length, 2);
        test.assertEquals(['foo', 'foo2'], keys.sort());
        wasCalledBack();
    });

    // At this point we have foo, baz, boo, and foo2, unicode
    expectCallback();
    client.keys('*', function (err, keys) {
        test.assertEquals(keys.length, 5);
        test.assertEquals(['baz', 'boo', 'foo', 'foo2', 'unicode'], keys.sort());
        wasCalledBack();
    });

    // foo and boo
    expectCallback();
    client.keys('?oo', function (err, keys) {
        test.assertEquals(keys.length, 2);
        test.assertEquals(['boo', 'foo'], keys.sort());
        wasCalledBack();
    });
}

function testRandomkey() {
    // At this point we have foo, baz, boo, foo2, unicode.
    expectCallback();
    client.randomkey(function (err, someKey) {
        test.assertTrue(/^(foo|foo2|boo|baz|unicode)$/.test(someKey));
        wasCalledBack();
    });
}

function testRename() {
    client.rename('foo2', 'zoo', expectTrueReply) 
    client.exists('foo2', expectZeroAsReply)
    client.exists('zoo', expectOneAsReply)
}

function testRenamenx() {
    client.renamenx('zoo', 'boo', expectZeroAsReply)    // boo already exists
    client.exists('zoo', expectOneAsReply)              // was not renamed
    client.exists('boo', expectOneAsReply)              // was not touched
    client.renamenx('zoo', 'too', expectOneAsReply)     // too did not exist... OK
    client.exists('zoo', expectZeroAsReply)             // was renamed
    client.exists('too', expectOneAsReply)              // was created
}

function testDbsize() {
    expectCallback();
    client.dbsize(function (err, value) { 
        test.assertEquals(5, value); 
        wasCalledBack();
    });
}

function testExpire() {
    // set 'too' to expire in 2 seconds
    client.expire('too', 2, expectOneAsReply)

    // subsequent expirations cannot be set.
    client.expire('too', 2, expectZeroAsReply)

    setTimeout(function () {
        sys.puts("\nWaiting a few seconds for key expirations...\n");
    }, 1000);

    // check that in 4 seconds that it's gone 
    setTimeout(function () { 
        client.exists('too', function(err, reply) {
            expectZeroAsReply(err, reply);
            if (pendingCallbacks === 0) {
                sys.puts("\n\nall tests have completed");
                process.exit(0);
            }
        });
    }, 4000);
}

function testTtl() {
    // foo is not set to expire
    expectCallback();
    client.ttl('foo', function (err, value) { 
        test.assertEquals(-1, value); 
        wasCalledBack(); 
    });

    // 'too' *is* set to expire
    expectCallback();
    client.ttl('too', function (err, value) { 
        test.assertTrue(value > 0);
        wasCalledBack();
    });
}

function testRpush() {
    client.exists('list0', expectZeroAsReply)
    client.rpush('list0', 'list0value0', expectTrueReply)
    client.exists('list0', expectOneAsReply)
}

function testLpush() {
    client.exists('list1', expectZeroAsReply)
    client.lpush('list1', 'list1value0', expectTrueReply)
    client.exists('list1', expectOneAsReply)
}

function testLlen() {
    client.llen('list0', expectOneAsReply)
    client.rpush('list0', 'list0value1', expectTrueReply)

    expectCallback();
    client.llen('list0', function (err, len) { 
        test.assertEquals(2, len);
        wasCalledBack();
    });
}

function testLrange() {
    expectCallback();
    client.lrange('list0', 0, -1, function (err, values) {
        test.assertEquals(2, values.length);
        test.assertEquals('list0value0', values[0]);
        test.assertEquals('list0value1', values[1]);
        wasCalledBack();
    });

    expectCallback();
    client.lrange('list0', 0, 0, function (err, values) {
        test.assertEquals(1, values.length);
        test.assertEquals('list0value0', values[0]);
        wasCalledBack();
    });

    expectCallback();
    client.lrange('list0', -1, -1, function (err, values) {
        test.assertEquals(1, values.length);
        test.assertEquals('list0value1', values[0]);
        wasCalledBack();
    });
}

function testLtrim() {
    // trim list so it just contains the first 2 elements

    client.rpush('list0', 'list0value2', expectTrueReply)

    expectCallback();
    client.llen('list0', function (err, len) { 
        test.assertEquals(3, len);
        wasCalledBack();
    });

    client.ltrim('list0', 0, 1, expectTrueReply)

    expectCallback();
    client.llen('list0', function (err, len) { 
        test.assertEquals(2, len);
        wasCalledBack();
    });

    expectCallback();
    client.lrange('list0', 0, -1, function (err, values) {
        test.assertEquals(2, values.length);
        test.assertEquals('list0value0', values[0]);
        test.assertEquals('list0value1', values[1]);
        wasCalledBack();
    });
}

function testLindex() {
    expectCallback();
    client.lindex('list0', 0, function (err, value) { 
        test.assertEquals('list0value0', value);
        wasCalledBack();
    });

    expectCallback();
    client.lindex('list0', 1, function (err, value) { 
        test.assertEquals('list0value1', value);
        wasCalledBack();
    });

    // out of range => null 
    expectCallback();
    client.lindex('list0', 2, function (err, value) { 
        test.assertEquals(null, value);
        wasCalledBack();
    });
}

function testLset() {
    client.lset('list0', 0, 'LIST0VALUE0', expectTrueReply)    

    expectCallback();
    client.lrange('list0', 0, 0, function (err, values) {
        test.assertEquals(1, values.length);
        test.assertEquals('LIST0VALUE0', values[0]);
        wasCalledBack();
    });

    // FYI list0 is [ LIST0VALUE0, list0value1 ] at this point
}

function testLrem() {
    client.lpush('list0', 'ABC', expectTrueReply) 
    client.lpush('list0', 'DEF', expectTrueReply) 
    client.lpush('list0', 'ABC', expectTrueReply) 

    // FYI list0 is [ ABC, DEF, ABC, LIST0VALUE0, list0value1 ] at this point

    client.lrem('list0', 1, 'ABC', expectOneAsReply)
}

function testLpop() {
    // FYI list0 is [ DEF, ABC, LIST0VALUE0, list0value1 ] at this point

    expectCallback();
    client.lpop('list0', function (err, value) { 
        test.assertEquals('DEF', value);
        wasCalledBack();
    });

    expectCallback();
    client.lpop('list0', function (err, value) { 
        test.assertEquals('ABC', value);
        wasCalledBack();
    });
}

function testRpop() {
    // FYI list0 is [ LIST0VALUE0, list0value1 ] at this point
    
    expectCallback();
    client.rpop('list0', function (err, value) { 
        test.assertEquals('list0value1', value);
        wasCalledBack();
    });

    expectCallback();
    client.rpop('list0', function (err, value) { 
        test.assertEquals('LIST0VALUE0', value);
        wasCalledBack();
    });

    // list0 is now empty

    expectCallback();
    client.llen('list0', function (err, len) { 
        test.assertEquals(0, len);
        wasCalledBack();
    });
}

function testRpoplpush() {
    client.exists('rpoplpushSource', expectZeroAsReply)
    client.exists('rpoplpushTarget', expectZeroAsReply)

    client.rpush('rpoplpushSource', 'ABC', expectTrueReply) 
    client.rpush('rpoplpushSource', 'DEF', expectTrueReply) 

    // rpoplpushSource = [ 'ABC', 'DEF' ]
    // rpoplpushTarget = [ ]

    expectCallback();
    client.rpoplpush('rpoplpushSource', 'rpoplpushTarget', function (err, value) { 
        wasCalledBack();
        test.assertEquals('DEF', value);

        // rpoplpushSource = [ 'ABC' ]

        expectCallback();
        client.lrange('rpoplpushSource', 0, -1, function (err, values) {
            test.assertEquals(['ABC'], values);
            wasCalledBack();
        });

        // rpoplpushTarget = [ 'DEF' ]

        expectCallback();
        client.lrange('rpoplpushTarget', 0, -1, function (err, values) {
            test.assertEquals(['DEF'], values);
            wasCalledBack();
        });
    });
}

function testSadd() {
    // create set0
    client.sadd('set0', 'member0', expectOneAsReply)    

    // fails since it's already a member
    client.sadd('set0', 'member0', expectZeroAsReply)    
}

function testSismember() {
    client.sismember('set0', 'member0', expectOneAsReply)    
    client.sismember('set0', 'member1', expectZeroAsReply)    
}

function testScard() {
    client.scard('set0', expectOneAsReply) 
    client.sadd('set0', 'member1', expectOneAsReply)

    expectCallback();    
    client.scard('set0', function (err, cardinality) { 
        test.assertEquals(2, cardinality);
        wasCalledBack();
    }); 
}

function testSrem() {
    client.srem('set0', 'foobar', expectZeroAsReply) 
    client.srem('set0', 'member1', expectOneAsReply) 
    client.scard('set0', expectOneAsReply)                         // just member0 again
}

function testSpop() {
    client.sadd('zzz', 'member0', expectOneAsReply)
    client.scard('zzz', expectOneAsReply)

    expectCallback();    
    client.spop('zzz', function (err, value) {        
        wasCalledBack();
        test.assertEquals(value, 'member0');
        client.scard('zzz', expectZeroAsReply)
    });
}

function testSdiff() {
    client.sadd('bsh', 'x', expectOneAsReply)
    client.sadd('bsh', 'a', expectOneAsReply)
    client.sadd('bsh', 'b', expectOneAsReply)
    client.sadd('bsh', 'c', expectOneAsReply)
    client.sadd('hah', 'c', expectOneAsReply)
    client.sadd('hac', 'a', expectOneAsReply)
    client.sadd('hac', 'd', expectOneAsReply)
    expectCallback();    
    client.sdiff('bsh', 'hah', 'hac', function (err, values) {        
        wasCalledBack();
        values.sort();
        test.assertEquals(values.length, 2);
        test.assertEquals(values[0], 'b');
        test.assertEquals(values[1], 'x');
    });
}

function testSdiffstore() {
    client.sadd('bsh2', 'x', expectOneAsReply)    
    client.sadd('bsh2', 'a', expectOneAsReply)
    client.sadd('bsh2', 'b', expectOneAsReply)
    client.sadd('bsh2', 'c', expectOneAsReply)
    client.sadd('hah2', 'c', expectOneAsReply)
    client.sadd('hac2', 'a', expectOneAsReply)
    client.sadd('hac2', 'd', expectOneAsReply)

    // NB: returns the number of elements in the dstkey (here crunk2)

    client.sdiffstore('crunk2', 'bsh2', 'hah2', 'hac2', expectNumericReply(2))
    expectCallback();
    client.smembers('crunk2', function (err, members) {         
        wasCalledBack();
        members.sort();
        test.assertEquals(members.length, 2);
        test.assertEquals(members[0], 'b');
        test.assertEquals(members[1], 'x');
    });
}

function testSmembers() {
    expectCallback();
    client.smembers('set0', function (err, members) { 
        test.assertEquals(1, members.length);
        test.assertEquals('member0', members[0]);
        wasCalledBack();
    });

    client.sadd('set0', 'member1', expectOneAsReply)    

    expectCallback();
    client.smembers('set0', function (err, members) { 
        test.assertEquals(2, members.length);
        test.assertEquals(['member0', 'member1'], members.sort());
        wasCalledBack();
    });

    // doesn't exist => null

    expectCallback();
    client.smembers('set1', function (err, members) { 
        test.assertEquals(null, members);
        wasCalledBack();
    });
}

function testSmove() {
    client.smove('set0', 'set1', 'member1', expectOneAsReply)
    client.sismember('set0', 'member1', expectZeroAsReply)    
    client.sismember('set1', 'member1', expectOneAsReply)    

    // member is now moved so => 0
    client.smove('set0', 'set1', 'member1', expectZeroAsReply)
}

function testSinter() {
    client.sadd('sa', 'a', expectOneAsReply)
    client.sadd('sa', 'b', expectOneAsReply)
    client.sadd('sa', 'c', expectOneAsReply)
    
    client.sadd('sb', 'b', expectOneAsReply)
    client.sadd('sb', 'c', expectOneAsReply)
    client.sadd('sb', 'd', expectOneAsReply)
    
    client.sadd('sc', 'c', expectOneAsReply)
    client.sadd('sc', 'd', expectOneAsReply)
    client.sadd('sc', 'e', expectOneAsReply)

    expectCallback();
    client.sinter('sa', 'sb', function (err, intersection) {
        test.assertEquals(2, intersection.length);
        test.assertEquals(['b', 'c'], intersection.sort());
        wasCalledBack();
    });

    expectCallback();
    client.sinter('sb', 'sc', function (err, intersection) {
        test.assertEquals(2, intersection.length);
        test.assertEquals(['c', 'd'], intersection.sort());
        wasCalledBack();
    });

    expectCallback();
    client.sinter('sa', 'sc', function (err, intersection) {
        test.assertEquals(1, intersection.length);
        test.assertEquals('c', intersection[0]);
        wasCalledBack();
    });

    // 3-way

    expectCallback();
    client.sinter('sa', 'sb', 'sc', function (err, intersection) {
        test.assertEquals(1, intersection.length);
        test.assertEquals('c', intersection[0]);
        wasCalledBack();
    });
}

function testSinterstore() {
    client.sinterstore('inter-dst', 'sa', 'sb', 'sc', expectOneAsReply)

    expectCallback();
    client.smembers('inter-dst', function (err, members) { 
        test.assertEquals(1, members.length);
        test.assertEquals('c', members[0]);
        wasCalledBack();
    });
}

function testSunion() {
    expectCallback();
    client.sunion('sa', 'sb', 'sc', function (err, union) {
        test.assertEquals(['a', 'b', 'c', 'd', 'e'], union.sort());
        wasCalledBack();
    });
}

function testSunionstore() {
    expectCallback();
    client.sunionstore('union-dst', 'sa', 'sb', 'sc', function (err, cardinality) { 
        test.assertEquals(5, cardinality);
        wasCalledBack();
    });
    expectCallback();
    client.smembers('union-dst', function (err, members) { 
        test.assertEquals(5, members.length);
        test.assertEquals(['a', 'b', 'c', 'd', 'e'], members.sort());
        wasCalledBack();
    });
}

function testType() {
    expectCallback();
    client.type('union-dst', function (err, type) { 
        test.assertEquals('set', type);
        wasCalledBack();
    });
    expectCallback();
    client.type('list0', function (err, type) { 
        test.assertEquals('list', type);
        wasCalledBack();
    });
    expectCallback();
    client.type('foo', function (err, type) { 
        test.assertEquals('string', type);
        wasCalledBack();
    });
    expectCallback();
    client.type('xxx', function (err, type) { 
        test.assertEquals('none', type);
        wasCalledBack();
    });
}

function testMove() {
    client.move('list0', TEST_DB_NUMBER_FOR_MOVE, expectOneAsReply)
    client.select(TEST_DB_NUMBER_FOR_MOVE, expectTrueReply)
    client.exists('list0', expectOneAsReply)
    client.select(TEST_DB_NUMBER, expectTrueReply)
    client.exists('list0', expectZeroAsReply)
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
//                                                         = [ 4, 5, 6, 12 ] 
//                                                         = [ w3, w9, w4, w2 ]
//
// Thus, sorting x 'by w*' results in [ 3, 9, 4, 2 ]
//
// Once sorted redis can fetch entries at the keys indicated by the 'get' 
// pattern.    If we specify 'get o*', redis would fetch 
// [ o3, o9, o4, o2 ] since our sorted list was [ 3, 9, 4, 2 ].
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

function testSort() {
    client.del('x');    // just to be safe
    client.del('y');    // just to be safe
    
    client.rpush('y', 'd', expectTrueReply)
    client.rpush('y', 'b', expectTrueReply)
    client.rpush('y', 'a', expectTrueReply)
    client.rpush('y', 'c', expectTrueReply)

    client.rpush('x', '3', expectTrueReply)
    client.rpush('x', '9', expectTrueReply)
    client.rpush('x', '2', expectTrueReply)
    client.rpush('x', '4', expectTrueReply)

    client.set('w3', '4', expectTrueReply)
    client.set('w9', '5', expectTrueReply)
    client.set('w2', '12', expectTrueReply)
    client.set('w4', '6', expectTrueReply)
    
    client.set('o2', 'buz', expectTrueReply)
    client.set('o3', 'foo', expectTrueReply)
    client.set('o4', 'baz', expectTrueReply)
    client.set('o9', 'bar', expectTrueReply)
    
    client.set('p2', 'qux', expectTrueReply)
    client.set('p3', 'bux', expectTrueReply)
    client.set('p4', 'lux', expectTrueReply)
    client.set('p9', 'tux', expectTrueReply)

    // Now the data has been setup, we can test.

    // But first, test basic sorting.

    // y = [ d b a c ]
    // sort y ascending = [ a b c d ]
    // sort y descending = [ d c b a ]

    expectCallback();
    var opts = { lexicographically:true, ascending:true };
    client.sort('y', opts, function (err, sorted) { 
        test.assertEquals(['a', 'b', 'c', 'd'], sorted);
        wasCalledBack();
    });

    expectCallback();
    opts = { lexicographically:true, ascending:false };
    client.sort('y', opts, function (err, sorted) {
        test.assertEquals(['d', 'c', 'b', 'a'], sorted);
        wasCalledBack();
    });

    // Now try sorting numbers in a list.
    // x = [ 3, 9, 2, 4 ]

    expectCallback();
    opts = { ascending:true };
    client.sort('x', opts, function (err, sorted) {
        test.assertEquals([2, 3, 4, 9], sorted);
        wasCalledBack();
    });

    expectCallback();
    opts = { ascending:false };
    client.sort('x', opts, function (err, sorted) {
        test.assertEquals([9, 4, 3, 2], sorted);
        wasCalledBack();
    });

    // Try sorting with a 'by' pattern.
    
    expectCallback();
    opts = { ascending:true, byPattern:'w*' };
    client.sort('x', opts, function (err, sorted) {
        test.assertEquals([3, 9, 4, 2], sorted);
        wasCalledBack();
    });

    // Try sorting with a 'by' pattern and 1 'get' pattern.

    expectCallback();
    opts = { ascending:true, byPattern:'w*', getPatterns:['o*'] };
    client.sort('x', opts, function (err, sorted) {
        test.assertEquals(['foo', 'bar', 'baz', 'buz'], sorted);
        wasCalledBack();
    });

    // Try sorting with a 'by' pattern and 2 'get' patterns.

    expectCallback();
    opts = { ascending:true, byPattern:'w*', getPatterns:['o*', 'p*'] };
    client.sort('x', opts, function (err, sorted) {
        test.assertEquals(['foo', 'bux', 'bar', 'tux', 'baz', 'lux', 'buz', 'qux'], sorted);
        wasCalledBack();
    });

    // Try sorting with a 'by' pattern and 2 'get' patterns.
    // Instead of getting back the sorted set/list, store the values to a list.
    // Then check that the values are there in the expected order.

    expectCallback();
    opts = { ascending:true, byPattern:'w*', 
                     getPatterns:['o*', 'p*'], storeKey:'bacon' };
    client.sort('x', opts, function (err) {
        wasCalledBack();
        expectCallback();
        client.lrange('bacon', 0, -1, function (err, values) {
            test.assertEquals(['foo', 'bux', 'bar', 'tux', 'baz', 'lux', 'buz', 'qux'], values);
            wasCalledBack();
        });
    });
}

function testSave() {
    client.save(expectTrueReply)
}

function testBgsave() {
//    client.bgsave(, expectTrueReply)
}

function testLastsave() {
    expectCallback();
    client.lastsave( function (err, value) { 
        test.assertEquals(typeof(value), 'number');
        test.assertTrue(value > 0);
        wasCalledBack();
    });
}

function testFlushall() {
    // skipped
}

function testShutdown() {
    // skipped
}

function testSetNumber() {
    client.set('ggg', '123', expectTrueReply)
    client.set('ggg', 123, expectTrueReply)
}

function testMset() {
    // set a=b, c=d, e=f
    client.mset('a', 'b', 'c', 'd', 'e', 100, expectTrueReply)
}

function testMsetnx() {
    // should fail since key 'a' as we already set it
    client.msetnx('g', 'h', 'a', 'i', expectZeroAsReply)
    // should pass as key 'g' was NOT set in prev. command
    // since it failed due to key 'a' already existing.
    client.msetnx('g', 'h', 'i', 'j', expectOneAsReply)
}

function testZadd() {
    client.zadd('z0', 100, 'm0', expectOneAsReply)
    // Already added m0; just update the score to 50:
    client.zadd('z0', 50, 'm0', expectZeroAsReply)
}

function testZrem() {
    client.zrem('z0', 'm0', expectOneAsReply)
    client.zrem('z0', 'm0', expectZeroAsReply)
}

function testZcard() {
    client.zcard('zzzzzz', expectZeroAsReply) // doesn't exist.
    client.zadd('z0', 100, 'm0', expectOneAsReply)
    client.zcard('z0', expectNumericReply(1))
    client.zadd('z0', 200, 'm1', expectOneAsReply)
    client.zcard('z0', expectNumericReply(2))
}

function testZscore() {
    client.zscore('z0', 'm0', expectNumericReply(100))
    client.zscore('z0', 'm1', expectNumericReply(200))
    expectCallback();
    client.zscore('z0', 'zzzzzzz', function (err, score) { 
        test.assertTrue(isNaN(score));
        wasCalledBack();
    });
}

function testZrange() {
    client.zadd('z0', 300, 'm2', expectOneAsReply)
    expectCallback();
    client.zrange('z0', 0, 1000, function (err, members) { 
        test.assertEquals(3, members.length);
        test.assertEquals('m0', members[0]);
        test.assertEquals('m1', members[1]);
        test.assertEquals('m2', members[2]);
        wasCalledBack();
    });
    expectCallback();
    client.zrange('z0', -1, -1, function (err, members) { 
        test.assertEquals(1, members.length);
        test.assertEquals('m2', members[0]);
        wasCalledBack();
    });
    expectCallback();
    client.zrange('z0', -2, -1, function (err, members) { 
        test.assertEquals(2, members.length);
        test.assertEquals('m1', members[0]);
        test.assertEquals('m2', members[1]);
        wasCalledBack();
    });
}

function testZrevrange() {
    expectCallback();
    client.zrevrange('z0', 0, 1000, function (err, members) { 
        test.assertEquals(3, members.length);
        test.assertEquals('m2', members[0]);
        test.assertEquals('m1', members[1]);
        test.assertEquals('m0', members[2]);
        wasCalledBack();
    });
}

function testZrangebyscore() {
    expectCallback();
    client.zrangebyscore('z0', 200, 300, function (err, members) {
        test.assertEquals(2, members.length);
        test.assertEquals('m1', members[0]);
        test.assertEquals('m2', members[1]);
        wasCalledBack();
    });
    expectCallback();
    client.zrangebyscore('z0', 100, 1000, function (err, members) {
        test.assertEquals(3, members.length);
        test.assertEquals('m0', members[0]);
        test.assertEquals('m1', members[1]);
        test.assertEquals('m2', members[2]);
        wasCalledBack();
    });
    expectCallback();
    client.zrangebyscore('z0', 10000, 100000, function (err, members) {
        test.assertEquals(0, members.length);
        wasCalledBack();
    });
}

// First, let's make sure the reply parsers are working.

function testBulkReply() {
    var a = "$6\r\nFOOBAR\r\n";
    var b = "$-1\r\n";
    var c = "$-1\r";     // NB: partial command, missing \n

    var result = client.parseBulkReply(0, a);
    test.assertEquals(2, result.length);
    test.assertEquals("FOOBAR", result[0]);
    test.assertEquals(a.length, result[1]);    // next reply is after this one.

    result = client.parseBulkReply(0, b);
    test.assertEquals(2, result.length);
    test.assertEquals(null, result[0]);
    test.assertEquals(b.length, result[1]);    // next reply is after this one.

    result = client.parseBulkReply(0, c);
    test.assertEquals(null, result);
}

function testMultiBulkReply() {
    var a = "*4\r\n$3\r\nFOO\r\n$3\r\nBAR\r\n$5\r\nHELLO\r\n$5\r\nWORLD\r\n";
    var b = "$-1\r\n";
    var c = "*3\r\n$3\r\nFOO\r\n$-1\r\n$4\r\nBARZ\r\n";

    var result = client.parseMultiBulkReply(a);
    test.assertEquals(2, result.length);
    var values = result[0];
    test.assertEquals(4, values.length);
    test.assertEquals('FOO', values[0]);
    test.assertEquals('BAR', values[1]);
    test.assertEquals('HELLO', values[2]);
    test.assertEquals('WORLD', values[3]);
    test.assertEquals(a.length, result[1]);

    result = client.parseMultiBulkReply(b);
    test.assertEquals(2, result.length);
    test.assertEquals(null, result[0]);
    test.assertEquals(b.length, result[1]);

    result = client.parseMultiBulkReply(c);
    test.assertEquals(2, result.length);
    values = result[0];
    test.assertEquals(3, values.length);
    test.assertEquals('FOO', values[0]);
    test.assertEquals(null, values[1]);
    test.assertEquals('BARZ', values[2]);
    test.assertEquals(c.length, result[1]);
}

function testInlineReply() {
    var a = "+OK\r\n";
    var b = "+WHATEVER\r\n";

    var result = client.parseInlineReply(a);
    test.assertEquals(2, result.length);
    test.assertEquals(true, result[0]);
    test.assertEquals(a.length, result[1]);

    result = client.parseInlineReply(b);
    test.assertEquals(2, result.length);
    test.assertEquals("WHATEVER", result[0]);
    test.assertEquals(b.length, result[1]);
}

function testIntegerReply() {
    var a = ":-1\r\n";
    var b = ":1000\r\n";

    var result = client.parseIntegerReply(a);
    test.assertEquals(2, result.length);
    test.assertEquals(-1, result[0]);
    test.assertEquals(a.length, result[1]);

    result = client.parseIntegerReply(b);
    test.assertEquals(2, result.length);
    test.assertEquals(1000, result[0]);
    test.assertEquals(b.length, result[1]);
}

function testErrorReply() {
    var a = "-ERR solar flare\r\n";
    var b = "-hiccup\r\n";

    var result = client.parseErrorReply(a);
    test.assertEquals(2, result.length);
    test.assertEquals("solar flare", result[0]);
    test.assertEquals(a.length, result[1]);

    result = client.parseErrorReply(b);
    test.assertEquals(2, result.length);
    test.assertEquals("hiccup", result[0]);
    test.assertEquals(b.length, result[1]);
}

// This is an array of test functions.    Order is important as we don't have
// fixtures.    We test 'set' before 'get' for instance.

var clientTests = [ 
    testAuth, testSelect, testFlushdb, testSet, testSetnx, testGet, testMget,
    testGetset, testSetAndGetMultibyte, testInfo, testIncr, testIncrby,
    testDecr, testDecrby, testExists, testDel, testKeys, testRandomkey,
    testRename, testRenamenx, testDbsize, testExpire, testTtl, testRpush,
    testLpush, testLlen, testLrange, testLtrim, testLindex, testLset, testLrem,
    testLpop, testRpop, testRpoplpush, testSadd, testSismember, testScard,
    testSrem, testSmembers, testSmove, testSinter, testSinterstore, testSunion,
    testSpop, testSdiff, testSdiffstore, testSunionstore, testType, testMove,
    testSort, testMset, testMsetnx, testZadd, testZrem, testZcard, testZscore,
    testZrange, testZrevrange, testZrangebyscore, testSave, testBgsave,
    testLastsave, testFlushall, testShutdown, testSetNumber,
];

function runAllTests() {
    // testBulkReply();
    // testMultiBulkReply();
    // testInlineReply();
    // testIntegerReply();
    // testErrorReply();

    clientTests.forEach(function (t) { 
        t();
    });

    sys.puts('**********\n\nall client tests have been submitted\n\n**********');
}

var connectionFailed = false;
var client = redisclient.createClient();

client.stream.addListener("connect", runAllTests);

client.stream.addListener("close", function (inError) {
    connectionFailed = inError;
    if (inError)
        throw new Error("Connection to Redis failed. Not attempting reconnection.");
});

process.addListener("uncaughtException", function (e) {
    sys.puts(e);
    process.exit(1);
});

process.addListener("exit", function (code) {
    sys.puts("pending callbacks: " + pendingCallbacks);
    if (!connectionFailed)
        test.assertEquals(0, pendingCallbacks);
});

