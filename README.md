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
    
    var foo = client.get('counter').addCallback(function (value) { 
      puts("counter = " + value) 
    }).addErrback(function (error) {
      sys.puts("oops! " + error);
    });

That is, you must supply a callback function that is called when Redis returns,
even if Redis queries are extremely fast.

A potential upside to this slightly awkward requirement is that you can enjoy
the benefits of pipelining many Redis queries in a non-blocking way.  Redis
returns replies for requests in the order received.

See the [test.js](http://github.com/fictorial/redis-node-client/raw/master/test.js) 
file as a good example of this.

## Status

* The full Redis 1.0 command specification is supported.
* All tests pass using Redis 1.02 and Node.js v0.1.18-18-gdc093ef.
* See the TODO file for known issues.

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
