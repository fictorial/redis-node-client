# SOONISH

- unit tests for publish, subscribe, unsubscribe
- wrapper to callback function when message is received on a channel?
    - is this distinct from the regular client callback?
- unit tests for hdel, hexists, hget, hgetall, hincrby, hkeys, hlen, hmget, hmset, hset, hvals
- unit tests for blpop, brpoplpush
- Update to support Node.js HEAD which is currently too buggy
- unit tests for zrank, zincrby, zrevrank, zremrangebyrank, zremrangebyscore, zunion, zinter
- MULTI/EXEC/DISCARD support -- how should we handle errors? report replies? etc.

# MAYBE SOMEDAY

- Provide wrapper around pretty-raw sort method?
- Consistent hashing ala redis-rb and txRedisAPI
- JS object-redis mapper using just redis hashes 
    - note: no nested objects in redis' hashes (so no nested lists, sets, hashes)
