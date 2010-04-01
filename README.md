Redis client for Node.js

---

The client supports pipelining by default.  That is, every command is submitted
to Redis asynchronously.  The client does not block waiting for a response from
Redis.  Your code can be called back when the response is available.

---

Each command is directly based on the Redis command specification but the
command methods are generated.  Thus, please refer to the
[specification](http://code.google.com/p/redis/wiki/CommandReference) as
documentation.  Also refer to the test.js tests for example usage.

---

All commands/requests use the Redis multi-bulk request format.

---

Tested with Node.js 0.1.33 and Redis 1.3.8.

