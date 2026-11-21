--[[
  CONFIRM: the user paid — turn their hold into a sale.

  The sweeper (which releases expired holds) and a late payment could
  run at the same moment. Because both remove the hold with ZREM inside
  an atomic script, exactly ONE of them wins. The item can never be
  both "sold" and "returned to stock".

  On success the user is added to the "paid" set IN THE SAME STEP.
  That set is our permanent record of "this person paid", even if the
  server crashes before the order reaches MongoDB. The reconciler uses
  it to find and repair any missing orders.

  KEYS[1] stock, KEYS[2] buyers, KEYS[3] holds, KEYS[4] paid
  ARGV[1] userId

  Returns:  1 = confirmed, it's yours
            0 = no hold found (never reserved, already paid, or already released)
           -1 = hold had expired (item goes back to stock)
]]
local expiresAt = redis.call('ZSCORE', KEYS[3], ARGV[1])
if not expiresAt then return 0 end

local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)

redis.call('ZREM', KEYS[3], ARGV[1])

if tonumber(expiresAt) < now then
  -- Too late: give the item back so someone else can buy it.
  redis.call('INCR', KEYS[1])
  redis.call('SREM', KEYS[2], ARGV[1])
  return -1
end

-- Paid in time. The user stays in "buyers" so they can't buy a second one.
redis.call('SADD', KEYS[4], ARGV[1])
return 1
