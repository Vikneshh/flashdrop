--[[
  ADMIT the next batch from the waiting room. Runs once per second.

  Takes the people with the lowest ticket numbers out of "waiting" and
  puts them in "admitted" with a deadline to reserve. Only admitted
  users can reserve (reserve.lua checks this), so checkout never sees
  more than `admitRate` new people per second, however big the crowd.

  NEVER ADMIT MORE PEOPLE THAN ITEMS:
  "admitted" only holds people who haven't reserved yet (reserve.lua
  removes you once you get a hold). So
      free slots = available stock − people already admitted
  Nobody waits in line, gets let in, and then finds it sold out.
  Trade-off: if admitted people wander off, their slot is stuck until
  their admission expires (admitWindowSeconds).

  ONE ADMISSION PER SECOND, EVEN WITH MANY SERVERS:
  every API server runs this loop. Without care, 3 servers would admit
  3x the rate. The SET ... NX PX lock means only the first server to
  arrive each second does the work; the others get "skip".

  KEYS[1] waiting, KEYS[2] admitted, KEYS[3] stock, KEYS[4] holds,
  KEYS[5] config, KEYS[6] admitLock

  Returns: number admitted, or -1 if another server already did this tick
]]
-- Waiting room turned off for this drop? Nothing to do.
if redis.call('HGET', KEYS[5], 'gated') ~= '1' then return 0 end

if not redis.call('SET', KEYS[6], '1', 'NX', 'PX', 950) then return -1 end

local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)

-- People who were admitted but never reserved in time lose their turn
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)

local stock = tonumber(redis.call('GET', KEYS[3]) or '0')
local slots = stock - redis.call('ZCARD', KEYS[2])
local rate = tonumber(redis.call('HGET', KEYS[5], 'admitRate'))
local count = math.min(rate, slots)

-- No free slots right now? Pause. If holds expire, stock comes back and we resume.
if count <= 0 then return 0 end

local windowMs = tonumber(redis.call('HGET', KEYS[5], 'admitWindowMs'))

-- ZPOPMIN returns a flat list: { user1, ticket1, user2, ticket2, ... }
local popped = redis.call('ZPOPMIN', KEYS[1], count)
for i = 1, #popped, 2 do
  redis.call('ZADD', KEYS[2], now + windowMs, popped[i])
end

return #popped / 2
