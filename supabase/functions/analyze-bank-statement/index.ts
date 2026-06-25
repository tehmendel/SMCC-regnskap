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
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY er ikke satt')

    const anthropic = new Anthropic({ apiKey })

    const categoryList = categories.map(c => `- ${c.name} (${c.type})`).join('\n')

    const prompt = `Du er en regnskapsassistent for en norsk motorsykkelklubb. Analyser denne kontoutskriften.

Tilgjengelige kategorier:
${categoryList}

Returner KUN et JSON-objekt (ingen annen tekst, ingen forklaring):
{
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "beskrivelse fra kontoutskriften",
      "amount": 123.45,
      "type": "utgift",
      "suggested_category_name": "kategori fra listen",
      "notes": ""
    }
  ],
  "vendors": [
    {
      "name": "Leverandørnavn (renset, uten dato/referanse)",
      "suggested_category_name": "kategori fra listen",
      "transaction_count": 3,
      "total_amount": 1500.00
    }
  ]
}

Regler for transactions:
- "type" er "utgift" hvis penger forlater kontoen, "inntekt" hvis penger kommer inn
- "amount" skal alltid være positivt
- Datoformat: YYYY-MM-DD
- Inkluder ALLE transaksjoner

Regler for vendors:
- Grupper transaksjonene på leverandørnavn — rens bort dato, referansenummer og variabel tekst
- Kun utgiftstransaksjoner
- Hvert innslag er én unik leverandør`

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
      max_tokens: 32000,
      messages: [{ role: 'user', content }],
    })

    if (response.stop_reason === 'max_tokens') {
      throw new Error('Dokumentet er for stort – prøv å dele det opp i kortere perioder')
    }

    const text = (response.content[0] as Anthropic.TextBlock).text
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('AI returnerte ikke gyldig JSON')

    const result = JSON.parse(match[0])
    const transactions: Record<string, unknown>[] = result.transactions || []
    const vendors: Record<string, unknown>[] = result.vendors || []

    const enrichedTx = transactions.map(t => {
      const cat = categories.find(c => c.name === t.suggested_category_name && c.type === t.type)
      return { ...t, suggested_category_id: cat?.id ?? null }
    })

    const enrichedVendors = vendors.map(v => {
      const cat = categories.find(c => c.name === v.suggested_category_name)
      return { ...v, suggested_category_id: cat?.id ?? null }
    })

    return new Response(JSON.stringify({ transactions: enrichedTx, vendors: enrichedVendors }), {
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
