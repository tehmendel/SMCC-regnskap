import Anthropic from 'npm:@anthropic-ai/sdk'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch (_) { /* controller may be closed */ }
      }

      try {
        const formData = await req.formData()
        const file = formData.get('file') as File
        const categoriesJson = formData.get('categories') as string
        const categories: Array<{ id: string; name: string; type: string }> = JSON.parse(categoriesJson)

        if (!file) throw new Error('Ingen fil ble mottatt av serveren')

        const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
        if (!apiKey) throw new Error('ANTHROPIC_API_KEY mangler — kontakt administrator')

        send('log', { message: `Fil mottatt: ${file.name} (${(file.size / 1024).toFixed(0)} KB)` })
        send('progress', { percent: 3 })

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
- Grupper på leverandørnavn — rens bort dato, referansenummer og variabel tekst
- Kun utgiftstransaksjoner
- Hvert innslag er én unik leverandør`

        let content: Anthropic.MessageParam['content']
        const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

        if (isPDF) {
          send('log', { message: 'Tolker PDF-dokument…' })
          send('progress', { percent: 6 })
          const arrayBuffer = await file.arrayBuffer()
          const uint8 = new Uint8Array(arrayBuffer)
          let binary = ''
          for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i])
          const base64 = btoa(binary)
          content = [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } as Anthropic.DocumentBlockParam,
            { type: 'text', text: prompt },
          ]
        } else {
          send('log', { message: 'Leser tekstfil…' })
          send('progress', { percent: 6 })
          const text = await file.text()
          content = [{ type: 'text', text: `Kontoutskrift:\n\n${text}\n\n${prompt}` }]
        }

        send('log', { message: 'Sender til Claude AI for analyse…' })
        send('progress', { percent: 10 })

        const aiStream = anthropic.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 32000,
          messages: [{ role: 'user', content }],
        })

        let buffer = ''
        let reportedCount = 0

        aiStream.on('text', (chunk: string) => {
          buffer += chunk

          const matches = [...buffer.matchAll(/"date":\s*"(\d{4}-\d{2}-\d{2})"/g)]
          if (matches.length > reportedCount) {
            for (let i = reportedCount; i < matches.length; i++) {
              const idx = matches[i].index ?? 0
              const snippet = buffer.substring(Math.max(0, idx - 30), idx + 350)
              const descMatch = snippet.match(/"description":\s*"([^"]+)"/)
              const amtMatch = snippet.match(/"amount":\s*([\d.]+)/)
              const typeMatch = snippet.match(/"type":\s*"(utgift|inntekt)"/)
              const desc = (descMatch?.[1] ?? '').substring(0, 50)
              const amt = amtMatch ? `${parseFloat(amtMatch[1]).toFixed(0)} kr` : ''
              const sign = typeMatch?.[1] === 'inntekt' ? '+' : '−'
              send('log', { message: `[${matches[i][1]}] ${desc}  ${sign}${amt}` })
            }
            reportedCount = matches.length
            send('progress', { percent: Math.min(12 + reportedCount * 1.2, 85) })
          }
        })

        const response = await aiStream.finalMessage()

        if (response.stop_reason === 'max_tokens') {
          throw new Error('Dokumentet er for stort. Prøv å laste opp ett kvartal av gangen.')
        }

        send('log', { message: `AI ferdig — ${reportedCount} transaksjoner funnet. Behandler resultater…` })
        send('progress', { percent: 93 })

        const rawText = (response.content[0] as Anthropic.TextBlock).text
        const match = rawText.match(/\{[\s\S]*\}/)

        if (!match) {
          throw new Error('AI returnerte ikke strukturert JSON. Dokumentformatet støttes kanskje ikke — prøv å eksportere som CSV fra banken.')
        }

        let result: { transactions?: unknown[]; vendors?: unknown[] }
        try {
          result = JSON.parse(match[0])
        } catch (e) {
          throw new Error(`JSON-feil i AI-svar: ${(e as Error).message}. Prøv igjen eller bruk en kortere periode.`)
        }

        const transactions = (result.transactions ?? []) as Record<string, unknown>[]
        const vendors = (result.vendors ?? []) as Record<string, unknown>[]

        const enrichedTx = transactions.map(t => {
          const cat = categories.find(c => c.name === t.suggested_category_name && c.type === t.type)
          return { ...t, suggested_category_id: cat?.id ?? null }
        })

        const enrichedVendors = vendors.map(v => {
          const cat = categories.find(c => c.name === v.suggested_category_name)
          return { ...v, suggested_category_id: cat?.id ?? null }
        })

        send('log', { message: `Fullført: ${transactions.length} transaksjoner · ${vendors.length} nye leverandørforslag` })
        send('progress', { percent: 100 })
        send('result', { transactions: enrichedTx, vendors: enrichedVendors })

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        send('log', { message: `Feil: ${msg}` })
        send('error', { message: msg })
      } finally {
        controller.close()
      }
    }
  })

  return new Response(readable, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  })
})
