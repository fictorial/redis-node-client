# A binary-safe Redis client for Node.js

The client supports *pipelining* by default.  That is, every command is
submitted to Redis asynchronously.  The client does not block waiting for a
response from Redis.  Your code can be called back when the response is
received from Redis.

Each command is directly based on the Redis command specification but the
command methods are generated.  Thus, please refer to the
[specification](http://code.google.com/p/redis/wiki/CommandReference) as
documentation.  

Also refer to the tests in `test.js` for usage examples.

All commands/requests use the Redis *multi-bulk request* format which 
will be the only accepted request protocol come Redis 2.0.

Tested with `Node.js v0.1.33-184-g53dd9fe` (past most recent stable) and Redis
`1.3.8`.

I'll package this for NPM and Kiwi soon.

