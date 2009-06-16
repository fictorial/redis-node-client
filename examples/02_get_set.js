var redis = require("../redis.js");

function onLoad() {
  redis.userConnectCallback = function() {
    redis.set('foo', 'bar');

    redis.get('foo', function(value) {
      puts("after set foo bar, foo = " + value);
    });
  };
}
