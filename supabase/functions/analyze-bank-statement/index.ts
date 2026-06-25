import Anthropic from 'npm:@anthropic-ai/sdk'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const categoriesJson = formData.get('categories') as string
    const categories: Array<{ id: string; name: string; type: string }> = JSON.parse(categoriesJson)

    if (!file) throw new Error('Ingen fil mottatt')

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY er ikke satt som hemmelighet i Supabase')

    const anthropic = new Anthropic({ apiKey })

    const categoryList = categories.map(c => `- ${c.name} (${c.type})`).join('\n')

    const prompt = `Du er en regnskapsassistent for en norsk motorsykkelklubb. Analyser denne kontoutskriften og trekk ut alle transaksjoner.

Tilgjengelige kategorier:
${categoryList}

Returner KUN et JSON-array (ingen annen tekst, ingen forklaring) i dette formatet:
[
  {
    "date": "YYYY-MM-DD",
    "description": "beskrivelse fra kontoutskriften",
    "amount": 123.45,
    "type": "utgift",
    "suggested_category_name": "kategori fra listen over",
    "notes": ""
  }
]

Regler:
- "type" er "utgift" hvis penger forlater kontoen, "inntekt" hvis penger kommer inn
- "amount" skal alltid være et positivt tall
- Datoformat: YYYY-MM-DD
- Velg kategori fra listen. Hvis ingen passer godt, bruk nærmeste alternativ
- Inkluder ALLE transaksjoner — ikke hopp over noen
- Ignorer renter, gebyrer for kontoinformasjon og lignende systemlinjer bare hvis de ikke er reelle kostnader`

    let content: Anthropic.MessageParam['content']

    const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

    if (isPDF) {
      const arrayBuffer = await file.arrayBuffer()
      const uint8 = new Uint8Array(arrayBuffer)
      let binary = ''
      for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i])
      const base64 = btoa(binary)

      content = [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        } as Anthropic.DocumentBlockParam,
        { type: 'text', text: prompt },
      ]
    } else {
      const text = await file.text()
      content = [{ type: 'text', text: `Kontoutskrift:\n\n${text}\n\n${prompt}` }]
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8096,
      messages: [{ role: 'user', content }],
      betas: isPDF ? ['pdfs-2024-09-25'] : undefined,
    } as Anthropic.MessageCreateParamsNonStreaming)

    const text = (response.content[0] as Anthropic.TextBlock).text
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('AI returnerte ikke gyldig JSON-liste')

    const transactions = JSON.parse(match[0])

    const enriched = transactions.map((t: Record<string, unknown>) => {
      const cat = categories.find(
        (c) => c.name === t.suggested_category_name && c.type === t.type,
      )
      return { ...t, suggested_category_id: cat?.id ?? null }
    })

    return new Response(JSON.stringify({ transactions: enriched }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
