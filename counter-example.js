var sys = require("sys");
var redis = require("./redisclient");

var client = new redis.Client();
client.connect(learn_to_count);

function learn_to_count () {
  client.incr('counter', function (err, value) {
    if(!err) {
      sys.puts("counter is now " + value);
      client.close();
    }
    else {
      sys.puts("oops! " + error);
      client.close();
    }
  });
}
