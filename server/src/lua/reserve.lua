--[[
  RESERVE: try to put one item on hold for a user.

  Redis runs this whole script as ONE step. While it runs, no other
  command can touch these keys, so "check stock + decrement" can never
  be interrupted by another buyer. Same idea as step 1's atomic update,
  but in memory, so it handles a much bigger crowd.

  KEYS[1] stock    – number of items still available
  KEYS[2] buyers   – set of users who hold or bought an item (1 per person)
  KEYS[3] holds    – sorted set: user -> time their hold expires (ms)
  KEYS[4] holdMs   – how long a hold lasts, in ms
  ARGV[1] userId

  Returns: expiresAt (ms) on success
            0 = sold out
           -1 = this user already has one
           -2 = drop doesn't exist
]]
local stock = redis.call('GET', KEYS[1])
if not stock then return -2 end

if redis.call('SISMEMBER', KEYS[2], ARGV[1]) == 1 then return -1 end

if tonumber(stock) <= 0 then return 0 end

-- Use Redis's clock, not the Node server's: with many servers,
-- their clocks can disagree. Redis is the single source of time.
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local expiresAt = now + tonumber(redis.call('GET', KEYS[4]))

redis.call('DECR', KEYS[1])
redis.call('SADD', KEYS[2], ARGV[1])
redis.call('ZADD', KEYS[3], expiresAt, ARGV[1])

return expiresAt
