--[[
  TOKEN BUCKET rate limiter.

  Picture a bucket that holds up to `capacity` tokens and refills at
  `perSecond` tokens per second. Every request takes one token.
  Empty bucket = request rejected (429 Too Many Requests).

  Why this shape? It allows short bursts (a user double-clicking, a page
  loading 3 things at once) up to `capacity`, but caps the steady rate
  at `perSecond`. A bot spamming 100 req/s drains it instantly.

  Stored as a tiny hash per user/IP: { tokens, ts }. We don't need a
  timer to refill — we calculate how much it WOULD have refilled since
  the last request.

  KEYS[1] bucket key, e.g. rl:ip:1.2.3.4
  ARGV[1] capacity, ARGV[2] perSecond

  Returns: { allowed (1/0), retryAfterMs }
]]
local capacity = tonumber(ARGV[1])
local perSecond = tonumber(ARGV[2])

local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)

local bucket = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(bucket[1]) or capacity
local last = tonumber(bucket[2]) or now

-- Refill for the time that passed, never above capacity
tokens = math.min(capacity, tokens + (now - last) * perSecond / 1000)

local allowed, retryAfterMs = 0, 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
else
  retryAfterMs = math.ceil((1 - tokens) * 1000 / perSecond)
end

redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
-- Forget idle buckets once they'd be full again anyway (saves memory)
redis.call('PEXPIRE', KEYS[1], math.ceil(capacity / perSecond * 1000) + 1000)

return { allowed, retryAfterMs }
