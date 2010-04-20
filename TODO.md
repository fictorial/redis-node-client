## Soon

- Support MULTI/EXEC/DISCARD. This is a little tricky given that its
  referred to as a "transaction" (but it's really a macro).  The API
  must clearly define what the hell is going on in error cases, etc.
  Also, we'll need to add support for nested multi-bulk replies. The
  reply parser, while it handles non-bulk replies inside a multi-bulk
  reply, does not handle multi-bulk replies inside multi-bulk replies.
  This is required for MULTI/EXEC.

- Fix reconnection logic.
    - Queue all commands.
    - If stream is writable, write.
    - On reconnection established, send 

## Later

- Provide wrapper around the pretty-raw sort method?

## Maybe

- Add support for consistent hashing ala redis-rb and txRedisAPI
- Add a higher-level interface similar to Ohm (Ruby)
