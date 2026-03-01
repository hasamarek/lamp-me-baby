import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const url = process.env.UPSTASH_REDIS_REST_URL ?? ''
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? ''
const isConfigured = url.startsWith('https://') && token.length > 10

// Server-side only — never import this in client components
// Falls back to a passthrough limiter when Redis is not configured (e.g. local dev)
export const ratelimit = isConfigured
  ? new Ratelimit({
      redis: new Redis({ url, token }),
      limiter: Ratelimit.slidingWindow(5, '1 h'),
      analytics: false,
    })
  : {
      limit: async (_ip: string) => ({
        success: true,
        limit: 5,
        remaining: 4,
        reset: Date.now() + 3600_000,
      }),
    }
