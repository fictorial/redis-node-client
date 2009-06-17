var redis = require("../redis.js");

function runDemo() {
  redis.set('foo', 'bar');

  redis.get('foo', function(value) {
    node.debug("after set foo bar, foo = " + value);
    redis.quit();
  });
}

function onLoad() {
  redis.connect();
  setTimeout(runDemo, 1000);
}
