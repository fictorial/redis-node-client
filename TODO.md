## Soon

- Support MULTI/EXEC/DISCARD. This is a little tricky given that its
  referred to as a "transaction" (but it's really a macro).  The API
  must clearly define what the hell is going on in error cases, etc.

## Later

- Support for NPM package manager
- Create a free list for request buffers instead of allocating one for each request?
- Provide wrapper around the pretty-raw sort method?

## Maybe

- Add support for consistent hashing ala redis-rb and txRedisAPI
- Add a higher-level interface similar to Ohm (Ruby)
