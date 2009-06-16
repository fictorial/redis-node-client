# redis-node-client

A Redis client implementation for Node which runs atop Google V8.

This project lets you access a Redis instance using JavaScript.

## Uses

The following projects together form a web services implementation that is
highly scalable and very easy to design (or play with), develop, and deploy.

* Google V8 ECMAScript interpreter
* Node
* node-json-rpc
* Redis

Google V8 can be found on Google Code.  The other projects are available on
GitHub.

## Asynchronicity

Node performs all I/O using libev and is thus asynchronous.  This means that
while a typical Redis client might have code that accesses a Redis server in a
blocking call, Node-based code cannot.

Typical Redis client (e.g. Python):

    foo = redis.get('counter')

This Node-based Redis client:

    var foo = redis.get('counter', function(value) { 
      puts("counter = " + value) 
    })

That is, you must supply a callback function that is called when Redis returns,
even if Redis queries are extremely fast.

A potential upside to this slightly awkward requirement is that you can enjoy
the benefits of pipelining many Redis queries in a non-blocking way.  Redis
returns replies for requests in the order received.

## Author

Brian Hammond, Fictorial
