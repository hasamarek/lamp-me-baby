import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI, type Part } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY ?? '')

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const conversionConcept = formData.get('conversionConcept') as string | null
  const objectDescription = formData.get('objectDescription') as string | null
  const imageFile = formData.get('image') as File | null

  if (!conversionConcept || !objectDescription) {
    return NextResponse.json({ error: 'Missing conversionConcept or objectDescription.' }, { status: 400 })
  }

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-image',
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      } as never,
    })

    const prompt = `You are looking at a photo of an object that a beginner DIY maker wants to turn into a lamp.

Object: ${objectDescription}
Conversion method: ${conversionConcept}

Generate a photorealistic image showing this EXACT object converted into a lamp:
- Keep the object's appearance completely identical — same shape, same colours, same patterns, same texture, same proportions
- The only addition is minimal lamp hardware: a lamp socket mounted at the top and a bare Edison-style bulb, with a cord exiting at the base
- Do NOT add a lampshade
- Do NOT change, simplify, or redesign the object in any way
- The result should look like a real person drilled a hole and fitted a basic lamp kit — honest and minimal

Style: warm natural light, plain white or light grey background, clean product photograph.`

    const parts: Part[] = [{ text: prompt }]

    if (imageFile) {
      const arrayBuffer = await imageFile.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')
      const mimeType = imageFile.type || 'image/jpeg'
      parts.unshift({ inlineData: { mimeType, data: base64 } })
    }

    const result = await model.generateContent(parts)
    const response = result.response

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        return NextResponse.json({
          imageBase64: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
        })
      }
    }

    return NextResponse.json({ error: 'No image generated.' }, { status: 500 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
