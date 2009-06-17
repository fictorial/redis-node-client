// Test suite for node (ECMAScript) redis client.
//
// NOTE: you must have started a redis-server instance on (the default)
// 127.0.0.1:6379 prior to running this test suite.
//
// NOTE: this test suite uses databases 14 and 15 for test purposes! It will
// **clear** this database at the start of the test runs.  If you want to use
// a different database number, update TEST_DB_NUMBER* below.
//
// FUN FACT: depending on your OS and network stack configuration, you might
// see the entire test suite's commands pipelined to redis before any reply is
// processed!

var TEST_DB_NUMBER = 15;
var TEST_DB_NUMBER_FOR_MOVE = 14;

include("mjsunit.js");

var redis = require("../redis.js");

function expectTrue(reply) {
  // Redis' protocol returns +OK for some operations.
  // The client converts this into a ECMAScript boolean type with value true.

  assertEquals(typeof(reply), 'boolean');
  assertTrue(reply);
}

function expectFalse(reply) {
  assertEquals(typeof(reply), 'boolean');
  assertFalse(reply);
}

function expectNumber(expectedValue, reply) {
  assertEquals(typeof(reply), 'number');
  assertEquals(expectedValue, reply);
}

function expectZero(reply) {
  expectNumber(0, reply);
}

function expectOne(reply) {
  expectNumber(1, reply);
}

function test_auth() {
  // You need to configure redis to enable auth.  
  // This unit test suite assumes the auth feature is off/disabled.
  // Auth *would be* the first command required after connecting.
}

// Test functions start with 'test_' and are listed here in executed order by
// convention.  NOTE: the actual list of tests is *manually* specified at the
// bottom of this file.

function test_select() {
  redis.select(TEST_DB_NUMBER_FOR_MOVE, expectTrue);
  redis.flushdb(expectTrue);

  redis.select(TEST_DB_NUMBER, expectTrue);
  redis.flushdb(expectTrue);
}

function test_flushdb() {
  // no-op; tested in test_select
}

function test_set() {
  redis.set('foo', 'bar', expectTrue);
  redis.set('baz', 'buz', expectTrue);
}

function test_setnx() {
  redis.setnx('foo', 'quux', expectZero);  // fails when already set
  redis.setnx('boo', 'apple', expectOne);  // no such key already so OK
}

function test_get() {
  redis.get('foo', function(value) { assertEquals(value, 'bar')   });
  redis.get('boo', function(value) { assertEquals(value, 'apple') });
}

function test_mget() {
  redis.mget('foo', 'boo', function(values) { 
    assertEquals('bar', values[0]);
    assertEquals('apple', values[1]);
  });
}

function test_getset() {
  redis.getset('foo', 'fuzz', function(prevValue) {
    assertEquals('bar', prevValue);
  });
}

function test_info() {
  redis.info(function(info) {
    // The INFO command is special; its output is parsed into an object.

    assertInstanceof(info, Object);

    assertTrue(info.hasOwnProperty('redis_version'));
    assertTrue(info.hasOwnProperty('connected_clients'));
    assertTrue(info.hasOwnProperty('uptime_in_seconds'));

    // Some values are always numbers.  Our redis client
    // will magically (ahem) convert these strings to actual
    // number types.  Make sure it does this.

    assertEquals(typeof(info.uptime_in_seconds), 'number');
    assertEquals(typeof(info.connected_clients), 'number');
  });
}

function test_incr() {
  redis.incr('counter', function(value) { expectNumber(value, 1) });
  redis.incr('counter', function(value) { expectNumber(value, 2) });
}

function test_incrby() {
  redis.incrby('counter', '2',  function(value) { expectNumber(value, 4) });
  redis.incrby('counter', '-1', function(value) { expectNumber(value, 3) });
}

function test_decr() {
  redis.decr('counter', function(value) { expectNumber(value, 2) });
  redis.decr('counter', function(value) { expectNumber(value, 1) });
  
}

function test_decrby() {
  redis.decrby('counter', '1',  function(value) { expectNumber(value, 0) });
  redis.decrby('counter', '2',  function(value) { expectNumber(value, -2) });
  redis.decrby('counter', '-3', function(value) { expectNumber(value, 1) });
}

function test_exists() {
  redis.exists('counter', expectOne);
  redis.exists('counter:asdfasdf', expectZero);
}

function test_del() {
  redis.del('counter', expectOne);
  redis.exists('counter', expectZero);
}

function test_keys() {
  redis.set('foo2', 'some value', expectTrue);

  redis.keys('foo*', function(keys) {
    assertEquals(keys.length, 2);
    assertEquals(['foo','foo2'], keys.sort());
  });

  // At this point we have foo, baz, boo, and foo2.
  redis.keys('*', function(keys) {
    assertEquals(keys.length, 4);
    assertEquals(['baz','boo','foo','foo2'], keys.sort());
  });

  // foo and boo
  redis.keys('?oo', function(keys) {
    assertEquals(keys.length, 2);
    assertEquals(['boo','foo'], keys.sort());
  });
}

function test_randomkey() {
  // At this point we have foo, baz, boo, and foo2.
  redis.randomkey(function(someKey) {
    assertTrue(/^(foo|foo2|boo|baz)$/.test(someKey));
  });
}

function test_rename() {
  redis.rename('foo2', 'zoo', expectTrue); 
  redis.exists('foo2', expectZero);
  redis.exists('zoo', expectOne);
}

function test_renamenx() {
  redis.renamenx('zoo', 'boo', expectZero);  // boo already exists
  redis.exists('zoo', expectOne);            // was not renamed
  redis.exists('boo', expectOne);            // was not touched

  redis.renamenx('zoo', 'too', expectOne);   // too did not exist... OK
  redis.exists('zoo', expectZero);           // was renamed
  redis.exists('too', expectOne);            // was created
}

function test_dbsize() {
  redis.dbsize(function(value) {
    assertEquals(4, value);
  });
}

function test_expire() {
  // set 'too' to expire in 2 seconds
  redis.expire('too', 2, expectOne);

  // subsequent expirations cannot be set.
  redis.expire('too', 2, expectZero);

  // check that in 4 seconds that it's gone 
  setTimeout(function() { redis.exists('too', expectZero) }, 4000);
}

function test_ttl() {
  // foo is not set to expire
  redis.ttl('foo', function(value) { assertEquals(-1, value) });

  // 'too' *is* set to expire
  redis.ttl('too', function(value) { assertTrue(value > 0) });
}

function test_rpush() {
  redis.exists('list0', expectZero);
  redis.rpush('list0', 'list0value0', expectTrue);
  redis.exists('list0', expectOne);
}

function test_lpush() {
  redis.exists('list1', expectZero);
  redis.lpush('list1', 'list1value0', expectTrue);
  redis.exists('list1', expectOne);
}

function test_llen() {
  redis.llen('list0', expectOne);
  redis.rpush('list0', 'list0value1', expectTrue);
  redis.llen('list0', function(len) { assertEquals(2, len) });
}

function test_lrange() {
  redis.lrange('list0', 0, -1, function(values) {
    assertEquals(2, values.length);
    assertEquals('list0value0', values[0]);
    assertEquals('list0value1', values[1]);
  });

  redis.lrange('list0', 0, 0, function(values) {
    assertEquals(1, values.length);
    assertEquals('list0value0', values[0]);
  });

  redis.lrange('list0', -1, -1, function(values) {
    assertEquals(1, values.length);
    assertEquals('list0value1', values[0]);
  });
}

function test_ltrim() {
  // trim list so it just contains the first 2 elements

  redis.rpush('list0', 'list0value2', expectTrue);
  redis.llen('list0', function(len) { assertEquals(3, len) });
  redis.ltrim('list0', 0, 1, expectTrue);
  redis.llen('list0', function(len) { assertEquals(2, len) });

  redis.lrange('list0', 0, -1, function(values) {
    assertEquals(2, values.length);
    assertEquals('list0value0', values[0]);
    assertEquals('list0value1', values[1]);
  });
}

function test_lindex() {
  redis.lindex('list0', 0, function(value) { assertEquals('list0value0', value) });
  redis.lindex('list0', 1, function(value) { assertEquals('list0value1', value) });

  // out of range => null 
  redis.lindex('list0', 2, function(value) { assertEquals(null, value) });
}

function test_lset() {
  redis.lset('list0', 0, 'LIST0VALUE0', expectTrue);  

  redis.lrange('list0', 0, 0, function(values) {
    assertEquals(1, values.length);
    assertEquals('LIST0VALUE0', values[0]);
  });

  // FYI list0 is [ LIST0VALUE0, list0value1 ] at this point
}

function test_lrem() {
  redis.lpush('list0', 'ABC', expectTrue); 
  redis.lpush('list0', 'DEF', expectTrue); 
  redis.lpush('list0', 'ABC', expectTrue); 

  // FYI list0 is [ ABC, DEF, ABC, LIST0VALUE0, list0value1 ] at this point

  redis.lrem('list0', 1, 'ABC', expectOne);
}

function test_lpop() {
  // FYI list0 is [ DEF, ABC, LIST0VALUE0, list0value1 ] at this point
  
  redis.lpop('list0', function(value) { assertEquals('DEF', value) });
  redis.lpop('list0', function(value) { assertEquals('ABC', value) });
}

function test_rpop() {
  // FYI list0 is [ LIST0VALUE0, list0value1 ] at this point
  
  redis.rpop('list0', function(value) { assertEquals('list0value1', value) });
  redis.rpop('list0', function(value) { assertEquals('LIST0VALUE0', value) });

  // list0 is now empty

  redis.llen('list0', function(len) { assertEquals(0, len) });
}

function test_sadd() {
  // create set0
  redis.sadd('set0', 'member0', expectOne);  

  // fails since it's already a member
  redis.sadd('set0', 'member0', expectZero);  
}

function test_sismember() {
  redis.sismember('set0', 'member0', expectOne);  
  redis.sismember('set0', 'member1', expectZero);  
}

function test_scard() {
  redis.scard('set0', expectOne); 
  redis.sadd('set0', 'member1', expectOne);  
  redis.scard('set0', function(cardinality) { assertEquals(2, cardinality) }); 
}

function test_srem() {
  redis.srem('set0', 'foobar', expectZero); 
  redis.srem('set0', 'member1', expectOne); 
  redis.scard('set0', expectOne);             // just member0 again
}

function test_smembers() {
  redis.smembers('set0', function(members) { 
    assertEquals(1, members.length);
    assertEquals('member0', members[0]);
  });

  redis.sadd('set0', 'member1', expectOne);  

  redis.smembers('set0', function(members) { 
    assertEquals(2, members.length);
    assertEquals(['member0','member1'], members.sort());
  });

  // doesn't exist => null

  redis.smembers('set1', function(members) { 
    assertEquals(null, members);
  });
}

function test_smove() {
  redis.smove('set0', 'set1', 'member1', expectOne);
  redis.sismember('set0', 'member1', expectZero);  
  redis.sismember('set1', 'member1', expectOne);  

  // member is now moved so => 0
  redis.smove('set0', 'set1', 'member1', expectZero);
}

function test_sinter() {
  redis.sadd('sa', 'a', expectOne);
  redis.sadd('sa', 'b', expectOne);
  redis.sadd('sa', 'c', expectOne);
  
  redis.sadd('sb', 'b', expectOne);
  redis.sadd('sb', 'c', expectOne);
  redis.sadd('sb', 'd', expectOne);
  
  redis.sadd('sc', 'c', expectOne);
  redis.sadd('sc', 'd', expectOne);
  redis.sadd('sc', 'e', expectOne);

  redis.sinter('sa', 'sb', function(intersection) {
    assertEquals(2, intersection.length);
    assertEquals(['b','c'], intersection.sort());
  });

  redis.sinter('sb', 'sc', function(intersection) {
    assertEquals(2, intersection.length);
    assertEquals(['c','d'], intersection.sort());
  });

  redis.sinter('sa', 'sc', function(intersection) {
    assertEquals(1, intersection.length);
    assertEquals('c', intersection[0]);
  });

  // 3-way

  redis.sinter('sa', 'sb', 'sc', function(intersection) {
    assertEquals(1, intersection.length);
    assertEquals('c', intersection[0]);
  });
}

function test_sinterstore() {
  redis.sinterstore('inter-dst', 'sa', 'sb', 'sc', expectOne);

  redis.smembers('inter-dst', function(members) { 
    assertEquals(1, members.length);
    assertEquals('c', members[0]);
  });
}

function test_sunion() {
  redis.sunion('sa', 'sb', 'sc', function(union) {
    assertEquals(['a','b','c','d','e'], union.sort());
  });
}

function test_sunionstore() {
  redis.sunionstore('union-dst', 'sa', 'sb', 'sc', function(cardinality) { assertEquals(5, cardinality) });

  redis.smembers('union-dst', function(members) { 
    assertEquals(5, members.length);
    assertEquals(['a','b','c','d','e'], members.sort());
  });
}

function test_type() {
  redis.type('union-dst', function(type) { assertEquals('set', type) });
  redis.type('list0',     function(type) { assertEquals('list', type) });
  redis.type('foo',       function(type) { assertEquals('string', type) });
  redis.type('xxx',       function(type) { assertEquals('none', type) });
}

function test_move() {
  redis.move('list0', TEST_DB_NUMBER_FOR_MOVE, expectOne);

  redis.select(TEST_DB_NUMBER_FOR_MOVE, expectTrue);
  redis.exists('list0', expectOne);

  redis.select(TEST_DB_NUMBER, expectTrue);
  redis.exists('list0', expectZero);
}

// Sort is a beast.
//
// $ redis-cli lrange x 0 -1
// 1. 3
// 2. 9
// 3. 2
// 4. 4
//
// $ redis-cli mget w_3 w_9 w_2 w_4
// 1. 4
// 2. 5
// 3. 12
// 4. 6
//
// $ redis-cli sort x by w_*
// 1. 3
// 2. 9
// 3. 4
// 4. 2
//
// When using 'by w_*' value x[i]'s effective value is w_{x[i]}.
//
// sort [ w_3, w_9, w_2, w_4 ] = sort [ 4, 5, 12, 6 ] 
//                             = [ 4, 5, 6, 12 ] 
//                             = [ w_3, w_9, w_4, w_2 ]
//
// Thus, sorting x 'by w_*' results in [ 3, 9, 4, 2 ]
//
// Once sorted redis can fetch entries at the keys indicated by the 'get' 
// pattern.  If we specify 'get o_*', redis would fetch 
// [ o_3, o_9, o_4, o_2 ] since our sorted list was [ 3, 9, 4, 2 ].
//
// $ redis-cli mget o_2 o_3 o_4 o_9
// 1. buz
// 2. foo
// 3. baz
// 4. bar
//
// $ redis-cli sort x by w_* get o_*
// 1. foo
// 2. bar
// 3. baz
// 4. buz
//
// One can specify multiple get patterns and the keys for each get pattern 
// are interlaced in the results.
//
// $ redis-cli mget p_2 p_3 p_4 p_9
// 1. qux
// 2. bux
// 3. lux
// 4. tux
//
// $ redis-cli sort x by w_* get o_* get p_*
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

function test_sort() {
//  redis.select(TEST_DB_NUMBER);

  redis.del('x');  // just to be safe
  redis.del('y');  // just to be safe
  
  redis.rpush('y', 'd', expectTrue);
  redis.rpush('y', 'b', expectTrue);
  redis.rpush('y', 'a', expectTrue);
  redis.rpush('y', 'c', expectTrue);

  redis.rpush('x', '3', expectTrue);
  redis.rpush('x', '9', expectTrue);
  redis.rpush('x', '2', expectTrue);
  redis.rpush('x', '4', expectTrue);

  redis.set('w_3', '4',  expectTrue);
  redis.set('w_9', '5',  expectTrue);
  redis.set('w_2', '12', expectTrue);
  redis.set('w_4', '6',  expectTrue);
  
  redis.set('o_2', 'buz', expectTrue);
  redis.set('o_3', 'foo', expectTrue);
  redis.set('o_4', 'baz', expectTrue);
  redis.set('o_9', 'bar', expectTrue);
  
  redis.set('p_2', 'qux', expectTrue);
  redis.set('p_3', 'bux', expectTrue);
  redis.set('p_4', 'lux', expectTrue);
  redis.set('p_9', 'tux', expectTrue);

  // Now the data has been setup, we can test.

  // But first, test basic sorting.

  // y = [ d b a c ]
  // sort y ascending = [ a b c d ]
  // sort y descending = [ d c b a ]

  redis.sort('y', { lexicographically:true, ascending:true }, function(sorted) {
    assertEquals(['a','b','c','d'], sorted);
  });

  redis.sort('y', { lexicographically:true, ascending:false }, function(sorted) {
    assertEquals(['d','c','b','a'], sorted);
  });

  // Now try sorting numbers in a list.
  // x = [ 3, 9, 2, 4 ]
  //
  // Note: this will auto-convert the strings to integers (since the strings
  // match /^\d+$/

  redis.sort('x', { ascending:true }, function(sorted) {
    assertEquals([2,3,4,9], sorted);
  });

  redis.sort('x', { ascending:false }, function(sorted) {
    assertEquals([9,4,3,2], sorted);
  });

  // Try sorting with a 'by' pattern.
  
  redis.sort('x', { ascending:true, byPattern:'w_*' }, function(sorted) {
    assertEquals([3,9,4,2], sorted);
  });

  // Try sorting with a 'by' pattern and 1 'get' pattern.

  redis.sort('x', { ascending:true, byPattern:'w_*', getPatterns:['o_*'] }, 
    function(sorted) {
      assertEquals(['foo','bar','baz','buz'], sorted);
    }
  );

  // Try sorting with a 'by' pattern and 2 'get' patterns.

  redis.sort('x', { ascending:true, byPattern:'w_*', getPatterns:['o_*', 'p_*'] }, 
    function(sorted) {
      assertEquals(['foo','bux','bar','tux','baz','lux','buz','qux'], sorted);
    }
  );
}

function test_save() {
  redis.save(expectTrue);  
}

function test_bgsave() {
  redis.bgsave(expectTrue);  
}

function test_lastsave() {
  redis.lastsave(function(value) { 
    assertEquals(typeof(value), 'number');
    assertTrue(value > 0);
  });
}

function test_flushall() {
  node.debug("flushall: skipped");
}

function test_shutdown() {
  node.debug("shutdown: skipped");
}

// This is an array of test functions.  Order is important as we don't have
// fixtures.  We test 'set' before 'get' for instance.

var tests = [ 
  test_auth, test_select, test_flushdb, test_set, test_setnx,
  test_get, test_mget, test_getset, test_info, test_incr, test_incrby, test_decr,
  test_decrby, test_exists, test_del, test_keys, test_randomkey, test_rename,
  test_renamenx, test_dbsize, test_expire, test_ttl, test_rpush, test_lpush,
  test_llen, test_lrange, test_ltrim, test_lindex, test_lset, test_lrem,
  test_lpop, test_rpop, test_sadd, test_sismember, test_scard, test_srem,
  test_smembers, test_smove, test_sinter, test_sinterstore, test_sunion,
  test_sunionstore, test_type, test_move, test_sort, test_save, test_bgsave, 
  test_lastsave, test_flushall, test_shutdown
];

function runTests() {
  print("Running tests, which include key expirations.  Please wait roughly 7-8 seconds.\n\n");

  tests.forEach(function(test) { 
    node.debug(test.name);
    test();
  });

  node.debug("\n\n\nall tests submitted... waiting for expiration tests...\n\n");

  setTimeout(function() {
    // Clean out the test databases.

    redis.select(TEST_DB_NUMBER);
    redis.flushdb();

    redis.select(TEST_DB_NUMBER_FOR_MOVE);
    redis.flushdb();

    redis.quit();
  }, 6000);
}

function onLoad() {
  redis.debugMode = true;

  redis.connect();

  // Let redis client connect to server.

  setTimeout(runTests, 1000);
}
