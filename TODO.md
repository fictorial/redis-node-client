# TO DO LIST

**Patches are always welcome!**

## Future / Redis 2.0

- Hashes: HGET, HSET, HDEL, HINCRBY, HEXISTS, HLEN, HMSET, HMGET, HKEYS, HVALS, HGETALL
- Strings: APPEND, SUBSTR, LEN, PEEK, POKE, SETBIT, GETBIT
- Blocking operations: BLPOP, BRPOPLPUSH
- Sorted sets: ZRANK, ZCOUNT, ZREVRANK, ZREMBYRANK, ZUNION, ZINTER
- Protocol stuff:
    - MULTI, EXEC
    - Multi-bulk client protocol support
    - LPUSH, RPUSH return length of list now, not OK
- [Channels](http://code.google.com/p/redis/issues/detail?id=209)

## Other

- Consistent hashing ala redis-rb and txRedisAPI
- JS object-redis mapper using just redis hashes 
    - note: no nested objects in redis' hashes (so no nested lists, sets, hashes)

