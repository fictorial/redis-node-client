## Soon

- Support MULTI/EXEC/DISCARD. This is a little tricky given that its
  referred to as a "transaction" (but it's really a macro).  The API
  must clearly define what the hell is going on in error cases, etc.
  Also, we'll need to add support for nested multi-bulk replies. The
  reply parser, while it handles non-bulk replies inside a multi-bulk
  reply, does not handle multi-bulk replies inside multi-bulk replies.
  This is required for MULTI/EXEC.

- Write an additional test of binary safety by reading a PNG from
  disk, writing it to redis, and reading it back, then comparing
  byte for byte that what we put in is what we got back.  This sounds
  wonky but it might be useful for sending "binary" data (images,
  sounds, whatever) via PUBSUB (see NodeRed).

## Later

- Provide wrapper around the pretty-raw sort method?

## Maybe

- Add support for consistent hashing ala redis-rb and txRedisAPI
- Add a higher-level interface similar to Ohm (Ruby)
