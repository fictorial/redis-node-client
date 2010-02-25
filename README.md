# redis-node-client

A Redis client implementation for Node.js which runs atop Google V8.

This project lets you access a Redis instance using server-side JavaScript.

## Asynchronicity

Node.js does not block on I/O operations.

This means that while a typical Redis client might have code that accesses a
Redis server in a blocking call, Node.js-based code cannot.

Typical Redis client (e.g. Python):

    foo = client.get('counter')

This Node.js-based Redis client:

    var sys = require("sys");
    var redis = require("./redisclient");

    var client = new redis.Client();
    client.connect(learn_to_count);

    function learn_to_count () {
        client.incr('counter', function (err, value) {
            sys.puts("counter is now " + value);
            client.close();
        });
    }

Running this example, we'd see:

    $ node counter-example.js
    counter is now 1
    $ node counter-example.js
    counter is now 2
    $ node counter-example.js
    counter is now 3

That is, you must supply a callback function that is called when Redis returns,
even if Redis queries are extremely fast.

A potential upside to this slightly awkward requirement is that you can enjoy
the benefits of pipelining many Redis queries in a non-blocking way.  Redis
returns replies for requests in the order received.

See the [test.js](http://github.com/fictorial/redis-node-client/raw/master/test.js) 
file as a good example of this.

## Status

* Tested against Redis 1.2.2 and Node.js v0.1.30-11-ge0ecf4f
* See the TODO file for known issues.
* Thanks for the work of the forkers to keep up with the fast pace of Node.js 
  and Redis development!

## Testing

To test:

1. fire up redis-server on 127.0.0.1:6379 (the default)
1. install node.js 
1. run `node test.js`

## Author

Brian Hammond, Fictorial (brian at fictorial dot com)

## Copyright

Copyright (C) 2009 Fictorial LLC

## License

See LICENSE (it's MIT; go nuts).
