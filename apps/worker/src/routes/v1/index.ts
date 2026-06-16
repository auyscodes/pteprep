import { Hono } from 'hono';
import { getSupabase } from '../../lib/supabase';
import { getSignedMediaUrl } from '../../lib/r2';
import { verifySupabaseJwt } from '../../lib/jwks';
import type { Env } from '../../types';

type Variables = {
  userId?: string;
};

const v1 = new Hono<{ Bindings: Env; Variables: Variables }>();

// Auth middleware — verifies JWT, extracts user_id from sub, passes through anon
v1.use('*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const userId = await verifySupabaseJwt(token, c.env.SUPABASE_URL);
    if (userId) {
      c.set('userId', userId);
    }
  }
  await next();
});

const QUESTION_SELECT =
  'id,question_type,is_ai_generated,is_public,tenant_id,cloned_from,clone_status,clone_review_score,clone_fail_reason,topic_title,topic_tag,difficulty,cefr_level,word_count,has_audio,has_image,media_url,passage_text,text_with_blanks,question_text,correct_answer,model_answer,swt_marked_passage,choices,paragraphs,blueprint,created_at,updated_at';

const DEFENCE_FILTER = 'is_ai_generated.eq.true,source_ref.is.null';

// GET /v1/questions — list Read Aloud questions with pagination
v1.get('/questions', async (c) => {
  const offset = parseInt(c.req.query('offset') || '0', 10);
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);

  const supabase = getSupabase(c.env);
  const { data, error, count } = await supabase
    .from('questions')
    .select(QUESTION_SELECT, { count: 'exact' })
    .eq('question_type', 'read_aloud')
    .eq('is_public', true)
    .or(DEFENCE_FILTER)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return c.json({ error: 'Failed to fetch questions' }, 500);
  }

  return c.json({
    questions: (data || []).map((q) => {
      const question = q as Record<string, unknown>;
      delete question.source_ref;
      return question;
    }),
    count: count || 0,
    offset,
    limit,
  });
});

// GET /v1/questions/:id — single question detail with signed media URLs
v1.get('/questions/:id', async (c) => {
  const id = c.req.param('id');

  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from('questions')
    .select(QUESTION_SELECT)
    .eq('id', id)
    .eq('question_type', 'read_aloud')
    .eq('is_public', true)
    .or(DEFENCE_FILTER)
    .single();

  if (error || !data) {
    return c.json({ error: 'Not found' }, 404);
  }

  const question = data as Record<string, unknown>;
  // Defence-in-depth: strip source_ref even if it somehow sneaks through
  delete question.source_ref;

  // Generate signed URLs for media on demand
  if (question.has_audio && question.media_url) {
    try {
      question.audio_url = await getSignedMediaUrl(
        c.env,
        question.media_url as string,
        3600,
      );
    } catch {
      question.audio_url = null;
    }
  }

  if (question.has_image && question.media_url) {
    try {
      question.image_url = await getSignedMediaUrl(
        c.env,
        question.media_url as string,
        3600,
      );
    } catch {
      question.image_url = null;
    }
  }

  return c.json(question);
});

export default v1;
