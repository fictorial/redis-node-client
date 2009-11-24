var sys = require("sys");
var redis = require("./redis");

var client = new redis.Client();
client.connect(learn_to_count);

function learn_to_count () {
  client.incr('counter').addCallback(function (value) {
    sys.puts("counter is now " + value);
    client.close();
  }).addErrback(function (error) {
    sys.puts("oops! " + error);
    client.close();
  });
}
