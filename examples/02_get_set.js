var redis = require("../redis.js");

function runDemo() {
  redis.set('foo', 'bar');

  redis.get('foo', function(value) {
    puts("after set foo bar, foo = " + value);

    redis.quit();
  });
}

function onLoad() {
  // Let redis connect to the server (only needed in test code).

  redis.connect();
  setTimeout(runDemo, 1000);
}
