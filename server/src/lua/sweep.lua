--[[
  SWEEP: release every hold whose time is up.

  Runs every second. Finds holds with expiresAt <= now, removes them,
  and puts each item back into stock. Safe to run from many servers at
  once: ZREM inside the script means each hold is released exactly once.

  KEYS[1] stock, KEYS[2] buyers, KEYS[3] holds

  Returns: how many holds were released
]]
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)

local expired = redis.call('ZRANGEBYSCORE', KEYS[3], '-inf', now, 'LIMIT', 0, 1000)

for _, userId in ipairs(expired) do
  redis.call('ZREM', KEYS[3], userId)
  redis.call('INCR', KEYS[1])
  redis.call('SREM', KEYS[2], userId) -- they can try again
end

return #expired
