# SOONISH

- are we binary safe for values given the XReply objects?
    - or do we need to use binary buffers? or buffer slices?
- Update to support Node.js HEAD now that showstopper bugs therein are squashed.
- MULTI/EXEC/DISCARD support -- how should we handle errors? report replies? etc.

# MAYBE SOMEDAY

- channel names not binary safe since they are stored in a JS object as key. Do we care?
- Provide wrapper around pretty-raw sort method?
- Consistent hashing ala redis-rb and txRedisAPI
- JS object-redis mapper using just redis hashes 
    - note: no nested objects in redis' hashes (so no nested lists, sets, hashes)
