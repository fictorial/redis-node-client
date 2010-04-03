## ASAP

- Use buffer objects instead of strings
    - Use UTF8 slices where strings are needed

- Redo reply parser as a state machine parser
    - Receive Buffer objects in 'data' events
    - Check each byte of the buffer to set parser state

- MULTI/EXEC/DISCARD

---

## Later 

- Provide wrapper around pretty-raw sort method?

- Consistent hashing ala redis-rb and txRedisAPI

- JS object-redis mapper using just redis hashes 
    - note: no nested objects in redis' hashes (so no nested lists, sets, hashes)
