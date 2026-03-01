import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { ratelimit } from '@/lib/ratelimit'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '127.0.0.1'
  const { success, limit, remaining, reset } = await ratelimit.limit(ip)

  if (!success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. You can submit up to 5 requests per hour.' },
      { status: 429, headers: {
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': String(remaining),
        'X-RateLimit-Reset': String(reset),
      }}
    )
  }

  const formData = await request.formData()
  const imageFile = formData.get('image') as File | null
  const previousConcept = formData.get('previousConcept') as string | null

  if (!imageFile) {
    return NextResponse.json({ error: 'No image provided.' }, { status: 400 })
  }

  const arrayBuffer = await imageFile.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  const mediaType = (imageFile.type || 'image/jpeg') as
    | 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

  const differentAngleHint = previousConcept
    ? `\n\nIMPORTANT: A previous analysis suggested: "${previousConcept}". You MUST propose a completely different conversion approach.`
    : ''

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: base64 },
        },
        {
          type: 'text',
          text: `You are an expert at identifying DIY upcycling potential in second-hand objects.

Analyze this photo of a found object and evaluate its potential to be converted into a lamp.

Return ONLY a JSON object with these fields:
- object: what the object is (e.g. "vintage bowling ball", "ceramic vase", "driftwood piece")
- material: primary material(s) (e.g. "ceramic", "wood", "metal")
- suitability: "high" | "medium" | "low" — how suitable it is for lamp conversion
- conversionConcept: one sentence describing the simplest, most beginner-friendly way to convert it into a lamp without altering its shape, pattern, colour, or decorative appearance — the object itself should remain completely unchanged, only minimal lamp hardware is added (e.g. "Drill a small hole in the base, feed an E27 cord kit through, and mount a socket on top — the vase stays entirely intact")
- estimatedDifficulty: "easy" | "medium" | "hard"
- summary: one enthusiastic sentence about its lamp potential${differentAngleHint}

Respond with only the JSON object, no markdown.`,
        },
      ],
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  let attributes: Record<string, string>
  try {
    const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    attributes = JSON.parse(cleaned)
  } catch {
    attributes = { summary: text }
  }

  return NextResponse.json({ attributes })
}
