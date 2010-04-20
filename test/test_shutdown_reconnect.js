#!/usr/bin/env node

// This is a test of robustly handling reconnection to Redis when Redis is
// brought down temporarily and then restarted.
//
// The client will queue commands and retry to connect with exponential
// backoff.
//
// Load up a test Redis instance in the foreground (daemonize off).  Then in
// another terminal run test/test_shutdown_reconnect.js This will issue 50,000
// GET commands.  While the output is scrolling by, kill Redis in the first
// terminal (^C should do fine).  You should see the client tell you it is
// queueing commands.  Then, restart Redis.  Watch as the client submits the
// queued commands after the current reconnection timeout expires.  Don't 
// wait too long; the delay is exponential remember.
//

// -------------
// This has uncovered a rather deep issue. We may submit requests to Redis,
// and then kill Redis, waiting for replies for submitted commands that will
// never come.  Fine, replay the commands that didn't get a reply, right? 
// No. Redis might have started processing some of the commands... 
// See http://gist.github.com/372038
// -------------

var 
  sys = require('sys'),
  redis = require('../lib/redis-client');

redis.debugMode = true;

client = redis.createClient();

var rem = 50000;

// We do not have to, but let the client stream establish 
// a connection to Redis before sending commands.

client.addListener("connected", function () {
  client.del("foo");

  for (var i=0; i<50000; ++i) 
    client.incr("foo", function () {
      if (--rem <= 0) {
        sys.puts("all 50000 callbacks called");
        process.exit(0);
      }
    });
});

setInterval(function () {
  sys.puts("test is waiting for " + rem + " callbacks.");
}, 1000);

