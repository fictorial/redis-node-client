// Test suite for node (ECMAScript) redis client.
//
// NOTE: you must have started a redis-server instance on (the default) 127.0.0.1:6379
// prior to running this test suite.
//
// NOTE: this test suite uses database 15 for test purposes! It will **clear** this
// database at the start of the test runs.  If you want to use a different database
// number, update TEST_DB_NUMBER below.
//
// FUN FACT: depending on your OS and network stack configuration, you might see the
// entire test suite's commands pipelined to redis before any reply is processed!
//

var TEST_DB_NUMBER = 15;

include("mjsunit.js");

var redis = require("../redis.js");

function expectTrueReply(reply) {
  // Redis' protocol returns +OK for some operations.
  // The client converts this into a ECMAScript boolean type with value true.

  assertEquals(typeof(reply), 'boolean');
  assertTrue(reply);
}

function expectNumericReply(reply, expectedValue) {
  assertEquals(typeof(reply), 'number');
  assertEquals(reply, expectedValue);
}

function expectZeroReply(reply) {
  expectNumericReply(reply, 0);
}

function expectOneReply(reply) {
  expectNumericReply(reply, 1);
}

// Test functions start with 'test_' and are listed here in executed order by
// convention.  NOTE: the actual list of tests is *manually* specified at the
// bottom of this file.

function test_select() {
  redis.select(TEST_DB_NUMBER, expectTrueReply);
}

function test_flushdb() {
  redis.flushdb(expectTrueReply);
}

function test_set() {
  redis.set('foo', 'bar', expectTrueReply);
  redis.set('baz', 'buz', expectTrueReply);
}

function test_setnx() {
  redis.setnx('foo', 'quux', expectZeroReply);  // fails when already set
  redis.setnx('boo', 'apple', expectOneReply);  // no such key already so OK
}

function test_get() {
  redis.get('foo', function(value) { 
    assertEquals(value, 'bar');
  });

  redis.get('boo', function(value) { 
    assertEquals(value, 'apple');
  });
}

function test_mget() {
  
}

function test_getset() {
  
}

function test_info() {
  redis.info(function(info) {
    // The INFO command is special; its output is parsed into an object.

    assertInstanceOf(info, 'object');

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

function test_auth() {
  // You need to configure redis to enable auth.  
  // This unit test suite assumes the auth feature is off/disabled.
}

function test_incr() {
  
}

function test_incrby() {
  
}

function test_decr() {
  
}

function test_decrby() {
  
}

function test_exists() {
  
}

function test_del() {
  
}

function test_type() {
  
}

function test_keys() {
  
}

function test_randomkey() {
  
}

function test_rename() {
  
}

function test_renamenx() {
  
}

function test_dbsize() {
  
}

function test_expire() {
  
}

function test_ttl() {
  
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

function test_info() {
  
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
  test_select,
  test_flushdb,
  test_set,
  test_setnx,
  test_get,
  test_mget,
  test_getset,
  test_info,
  test_auth,
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
  test_info,
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
  setTimeout(redis.quit, 1000);
}

function onLoad() {
  redis.debug = true;

  // Let redis client connect to server.

  setTimeout(runTests, 1000);
}
