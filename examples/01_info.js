var redis = require("../redis.js");

function runDemo() {
  // As our first test, let's ask it for redis metadata.
  // Methods on `redis` are named to match the redis commands.

  redis.info(function(info) {
    for (var property in info) 
      puts('REDIS INFO: ' + property + "=" + info[property]);
  });
}

function onLoad() {
  // Now that the redis module has been loaded, wait a bit to let the redis
  // client connect to the server else we could issue commands before
  // a connection has been established.
  //
  // In production, this won't normally be a concern but for test code, it is.

  setTimeout(runDemo, 1000);
}
