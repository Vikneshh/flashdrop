--[[
  JOIN the waiting room — like taking a token number at the bank.

  Each new person gets the next ticket number (INCR), and the waiting
  line is a sorted set ordered by ticket. First come, first served.
  Joining twice doesn't move you: you keep your original spot.

  KEYS[1] waiting   – sorted set: user -> ticket number
  KEYS[2] tickets   – counter for the next ticket number
  KEYS[3] admitted  – sorted set: user -> time their admission expires
  KEYS[4] stock, KEYS[5] holds, KEYS[6] config, KEYS[7] buyers
  ARGV[1] userId

  Returns: { 1, position }   waiting in line
           { 2, expiresAt }  already admitted, go buy
           { 3, 0 }          sold out, no point joining
           { 4, 0 }          you already have one (1 per person)
           { -2, 0 }         drop doesn't exist
]]
if redis.call('EXISTS', KEYS[6]) == 0 then return { -2, 0 } end

if redis.call('SISMEMBER', KEYS[7], ARGV[1]) == 1 then return { 4, 0 } end

local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)

local admittedUntil = redis.call('ZSCORE', KEYS[3], ARGV[1])
if admittedUntil and tonumber(admittedUntil) >= now then
  return { 2, tonumber(admittedUntil) }
end

local rank = redis.call('ZRANK', KEYS[1], ARGV[1])
if rank then return { 1, rank + 1 } end

-- Sold out for good = no stock AND no holds that might expire and come back
if tonumber(redis.call('GET', KEYS[4]) or '0') <= 0 and redis.call('ZCARD', KEYS[5]) == 0 then
  return { 3, 0 }
end

local ticket = redis.call('INCR', KEYS[2])
redis.call('ZADD', KEYS[1], ticket, ARGV[1])
return { 1, redis.call('ZRANK', KEYS[1], ARGV[1]) + 1 }
