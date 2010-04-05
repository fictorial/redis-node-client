## ASAP

- Use Buffer.growBy in ReplyParser instead of maxReplySize
- Use Buffer.copy in Client generated command send methods when arg is a Buffer to avoid slices
- Add support for Kiwi package manager
- Add support for NPM package manager

- MULTI/EXEC/DISCARD

---

## Later 

- Provide wrapper around pretty-raw sort method?
- Consistent hashing ala redis-rb and txRedisAPI
- JS object-redis mapper using just redis hashes 
    - note: no nested objects in redis' hashes (so no nested lists, sets, hashes)
