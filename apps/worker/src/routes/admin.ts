import { Hono } from 'hono'
import { getSupabase } from '../lib/supabase'
import { Env } from '../types'
const admin = new Hono<{ Bindings: Env }>()

// Auth middleware — all /admin routes require the API key
admin.use('*', async (c, next) => {
  const key = c.req.header('X-Admin-Key')
  if (key !== c.env.ADMIN_API_KEY) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
})

// Health check
admin.get('/health', (c) => c.json({ status: 'ok' }))

// Ingest a real question
admin.post('/ingest', async (c) => {
  const body = await c.req.json()
  const supabase = getSupabase(c.env)

  const {
    question_type, is_public = false, tenant_id = null,
    topic_title, topic_tag, difficulty, cefr_level, word_count,
    has_audio = false, has_image = false, media_url = null,
    passage_text, text_with_blanks, question_text,
    correct_answer, model_answer, swt_marked_passage,
    choices, paragraphs, blueprint, source_ref,
    source_json,
  } = body

  // Insert the question
  const { data: question, error: qErr } = await supabase
    .from('questions')
    .insert({
      question_type, is_public, tenant_id,
      is_ai_generated: false,
      topic_title, topic_tag, difficulty, cefr_level, word_count,
      has_audio, has_image, media_url,
      passage_text, text_with_blanks, question_text,
      correct_answer, model_answer, swt_marked_passage,
      choices, paragraphs, blueprint, source_ref,
    })
    .select('id')
    .single()

  if (qErr) return c.json({ error: qErr.message }, 500)

  // Insert source JSON separately
  if (source_json) {
    const { error: sErr } = await supabase
      .from('question_sources')
      .insert({ question_id: question.id, source_json })

    if (sErr) return c.json({ error: sErr.message }, 500)
  }

  return c.json({ question_id: question.id, status: 'ingested' }, 201)
})

admin.get('/test-insert', async (c) => {
  const url = `${c.env.SUPABASE_URL}/rest/v1/questions`
  
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': c.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${c.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      question_type: 'repeat_sentence',
      is_ai_generated: false,
      is_public: false,
      blueprint: {},
    }),
  })

  const text = await resp.text()
  return c.json({ status: resp.status, body: text })
})

export default admin