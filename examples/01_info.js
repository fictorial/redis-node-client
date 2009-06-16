var redis = require("../redis.js");

function onLoad() {
 
  // Redis client implementation is now loaded.
  // As our first test, let's ask it for its metadata.
  // Methods on `redis` are named to match the redis commands.
  // The Redis protocol reference will be useful.

  redis.info(function(info) {
    puts("Redis runtime information:");

    for (var property in info) 
      puts(property + ": " + info[property]);
  });
}
