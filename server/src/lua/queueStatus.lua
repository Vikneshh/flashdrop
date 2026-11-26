--[[
  "Where am I in line?" — the waiting-room screen polls this.

  KEYS[1] waiting, KEYS[2] admitted, KEYS[3] stock, KEYS[4] holds, KEYS[5] config
  ARGV[1] userId

  Returns: { 1, position, admitRate, admitWindowMs }  still waiting
           { 2, expiresAt, 0 }         your turn! go reserve before expiresAt
           { 3, 0, 0 }                 sold out
           { 0, 0, 0 }                 not in line (never joined, or turn expired)
           { -2, 0, 0 }                drop doesn't exist
]]
if redis.call('EXISTS', KEYS[5]) == 0 then return { -2, 0, 0 } end

local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)

local admittedUntil = redis.call('ZSCORE', KEYS[2], ARGV[1])
if admittedUntil and tonumber(admittedUntil) >= now then
  return { 2, tonumber(admittedUntil), 0 }
end

if tonumber(redis.call('GET', KEYS[3]) or '0') <= 0 and redis.call('ZCARD', KEYS[4]) == 0 then
  return { 3, 0, 0 }
end

local rank = redis.call('ZRANK', KEYS[1], ARGV[1])
if rank then
  local cfg = redis.call('HMGET', KEYS[5], 'admitRate', 'admitWindowMs')
  return { 1, rank + 1, tonumber(cfg[1]), tonumber(cfg[2]) }
end

return { 0, 0, 0 }
