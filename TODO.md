- Support MULTI/EXEC/DISCARD
- Support for Kiwi package manager
- Support for NPM package manager

---

- Create a free list for request buffers instead of allocating one for each request?
- Provide wrapper around pretty-raw sort method?
- Consistent hashing ala redis-rb and txRedisAPI
- JS object-redis mapper using just redis hashes 
    - note: no nested objects in redis' hashes (so no nested lists, sets, hashes)
