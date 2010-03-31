# YESTERDAY

- Unit tests: callbacks are not being called back!

# ASAP

- HASH unit tests from [here](http://github.com/jakemcgraw/redis-node-client/commit/138641c703b50a43f1d2d88a13a2ac604e3f6d5b)
- SORT using multi-bulk request format -- how?

# SOONISH

- Make this a branch of regular redis-node-client
- Update to support Node.js HEAD which is currently too buggy
- [PubSub](http://code.google.com/p/redis/issues/detail?id=209)
- PubSub unit tests
- MULTI/EXEC/DISCARD support -- how should we handle errors? report replies? etc.

# MAYBE SOMEDAY

- Consistent hashing ala redis-rb and txRedisAPI
- JS object-redis mapper using just redis hashes 
    - note: no nested objects in redis' hashes (so no nested lists, sets, hashes)
