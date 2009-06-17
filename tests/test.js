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
//

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

function expectNumber(reply, expectedValue) {
  assertEquals(typeof(reply), 'number');
  assertEquals(reply, expectedValue);
}

function expectZeroReply(reply) {
  expectNumber(reply, 0);
}

function expectOneReply(reply) {
  expectNumber(reply, 1);
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
  redis.select(TEST_DB_NUMBER, expectTrue);
}

function test_flushdb() {
  redis.flushdb(expectTrue);
}

function test_set() {
  redis.set('foo', 'bar', expectTrue);
  redis.set('baz', 'buz', expectTrue);
}

function test_setnx() {
  redis.setnx('foo', 'quux', expectZeroReply);  // fails when already set
  redis.setnx('boo', 'apple', expectOneReply);  // no such key already so OK
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
  redis.exists('counter', expectOneReply);
  redis.exists('counter:asdfasdf', expectZeroReply);
}

function test_del() {
  redis.del('counter', expectOneReply);
  redis.exists('counter', expectZeroReply);
}

function test_keys() {
  redis.set('foo2', 'some value', expectTrue);

  // TODO ordering isn't really specified in the redis command ref.

  redis.keys('foo*', function(keys) {
    assertEquals(keys.length, 2);
    assertEquals('foo', keys[0]);
    assertEquals('foo2', keys[1]);
  });

  // At this point we have foo, baz, boo, and foo2.
  redis.keys('*', function(keys) {
    assertEquals(keys.length, 4);
  });

  // foo and boo
  redis.keys('?oo', function(keys) {
    assertEquals(keys.length, 2);
    assertEquals('foo', keys[0]);
    assertEquals('boo', keys[1]);
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
  redis.exists('foo2', expectZeroReply);
  redis.exists('zoo', expectOneReply);
}

function test_renamenx() {
  redis.renamenx('zoo', 'boo', expectZeroReply);  // boo already exists
  redis.exists('zoo', expectOneReply);          // was not renamed
  redis.exists('boo', expectOneReply);          // was not touched

  redis.renamenx('zoo', 'too', expectOneReply);  // too did not exist... OK
  redis.exists('zoo', expectZeroReply);         // was renamed
  redis.exists('too', expectOneReply);          // was created
}

function test_dbsize() {
  redis.dbsize(function(value) {
    assertEquals(4, value);
  });
}

function test_expire() {
  // set 'too' to expire in one second 
  redis.expire('too', 2, expectOneReply);

  // subsequent expirations cannot be set.
  redis.expire('too', 2, expectZeroReply);

  // check that in 2 seconds that it's gone 
  setTimeout(function() { redis.exists('too', expectZeroReply) }, 4000);
}

function test_ttl() {
  // foo is not set to expire
  redis.ttl('foo', function(value) { assertEquals(-1, value) });

  // 'too' *is* set to expire
  redis.ttl('too', function(value) { assertTrue(value > 0) });
}

function test_llen() {
  
}

function test_lrange() {
  
}

function test_ltrim() {
  
}

function test_lindex() {
  
}

function test_lpop() {
  
}

function test_rpop() {
  
}

function test_scard() {
  
}

function test_sinter() {
  
}

function test_sinterstore() {
  
}

function test_sunion() {
  
}

function test_sunionstore() {
  
}

function test_smembers() {
  
}

function test_type() {
  
}

function test_move() {
  
}

function test_flushall() {
  // I'm not going to do this in case you test against your production 
  // instance by accident.
}

function test_save() {
  
}

function test_bgsave() {
  
}

function test_lastsave() {
  
}

function test_shutdown() {
  
}

function test_rpush() {
  
}

function test_lpush() {
  
}

function test_lset() {
  
}

function test_lrem() {
  
}

function test_sadd() {
  
}

function test_srem() {
  
}

function test_smove() {
  
}

function test_sismember() {
  
}

// This is an array of test functions.  Order is important as we don't have
// fixtures.  We test 'set' before 'get' for instance.

var tests = [ 
  test_auth,
  test_select,
  test_flushdb,
  test_set,
  test_setnx,
  test_get,
  test_mget,
  test_getset,
  test_info,
  test_incr,
  test_incrby,
  test_decr,
  test_decrby,
  test_exists,
  test_del,
  test_type,
  test_keys,
  test_randomkey,
  test_rename,
  test_renamenx,
  test_dbsize,
  test_expire,
  test_ttl,
  test_llen,
  test_lrange,
  test_ltrim,
  test_lindex,
  test_lpop,
  test_rpop,
  test_scard,
  test_sinter,
  test_sinterstore,
  test_sunion,
  test_sunionstore,
  test_smembers,
  test_move,
  test_flushall,
  test_save,
  test_bgsave,
  test_lastsave,
  test_shutdown,
  test_rpush,
  test_lpush,
  test_lset,
  test_lrem,
  test_sadd,
  test_srem,
  test_smove,
  test_sismember
];

function runTests() {
  tests.forEach(function(test) { test() });

  // Let any pending/timer-based tests finish up.
  // It's safe to hit ^C at this point if you want.

  print("\n\nall tests passed so far, finishing up...\n\n");
  setTimeout(redis.quit, 8000);
}

function onLoad() {
  redis.debug = true;

  // Let redis client connect to server.

  setTimeout(runTests, 1000);
}
