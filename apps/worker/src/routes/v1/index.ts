import { Hono } from 'hono';
import { getSupabase } from '../../lib/supabase';
import { getSignedMediaUrl, getSignedUploadUrl } from '../../lib/r2';
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

// POST /v1/sessions/:id/attempts — create a new practice attempt
v1.post('/sessions/:id/attempts', async (c) => {
  const userId = c.get('userId');
  if (!userId) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const sessionId = c.req.param('id');
  const supabase = getSupabase(c.env);

  const { data: session, error: sessionErr } = await supabase
    .from('practice_sessions')
    .select('id, user_id, ended_at')
    .eq('id', sessionId)
    .single();

  if (sessionErr || !session) {
    return c.json({ error: 'Session not found' }, 404);
  }

  if (session.user_id !== userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  if (session.ended_at) {
    return c.json({ error: 'Session has ended' }, 400);
  }

  let body: { question_id?: string };
  try {
    body = await c.req.json<{ question_id?: string }>();
  } catch {
    return c.json({ error: 'question_id is required' }, 400);
  }

  if (!body.question_id) {
    return c.json({ error: 'question_id is required' }, 400);
  }

  const { data: question, error: questionErr } = await supabase
    .from('questions')
    .select('id, question_type')
    .eq('id', body.question_id)
    .eq('question_type', 'read_aloud')
    .eq('is_public', true)
    .or(DEFENCE_FILTER)
    .single();

  if (questionErr || !question) {
    return c.json({ error: 'Invalid question' }, 400);
  }

  const { data: attempt, error: insertErr } = await supabase
    .from('practice_attempts')
    .insert({
      session_id: sessionId,
      question_id: body.question_id,
      user_id: userId,
      question_type: 'read_aloud',
      status: 'pending',
    })
    .select('id, session_id, question_id, status')
    .single();

  if (insertErr || !attempt) {
    return c.json({ error: 'Failed to create attempt' }, 500);
  }

  return c.json(attempt, 201);
});

// POST /v1/attempts/:id/submit — mark uploaded and enqueue for scoring
v1.post('/attempts/:id/submit', async (c) => {
  const userId = c.get('userId');
  if (!userId) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const attemptId = c.req.param('id');
  const supabase = getSupabase(c.env);

  const { data: attempt, error: lookupErr } = await supabase
    .from('practice_attempts')
    .select('id, session_id, question_id, user_id, question_type, status, recording_url')
    .eq('id', attemptId)
    .single();

  if (lookupErr || !attempt) {
    return c.json({ error: 'Attempt not found' }, 404);
  }

  if (attempt.user_id !== userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  if (!attempt.recording_url) {
    return c.json({ error: 'Recording not uploaded' }, 400);
  }

  const { data: updated, error: updateErr } = await supabase
    .from('practice_attempts')
    .update({ status: 'uploaded' })
    .eq('id', attemptId)
    .select('id, status, session_id, question_id, recording_url')
    .single();

  if (updateErr || !updated) {
    return c.json({ error: 'Failed to submit attempt' }, 500);
  }

  await c.env.SCORING_QUEUE.send({
    attemptId,
    recordingUrl: attempt.recording_url,
    questionType: attempt.question_type,
    version: 1,
  });

  return c.json(updated);
});

// POST /v1/recordings/upload-url — generate R2 upload Signed URL
v1.post('/recordings/upload-url', async (c) => {
  const userId = c.get('userId');
  if (!userId) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  let body: { attemptId?: string };
  try {
    body = await c.req.json<{ attemptId?: string }>();
  } catch {
    return c.json({ error: 'attemptId is required' }, 400);
  }

  if (!body.attemptId) {
    return c.json({ error: 'attemptId is required' }, 400);
  }

  if (/[\\/]|\.\./.test(body.attemptId)) {
    return c.json({ error: 'Invalid attemptId' }, 400);
  }

  const supabase = getSupabase(c.env);
  const { data: attempt, error: lookupErr } = await supabase
    .from('practice_attempts')
    .select('id, user_id')
    .eq('id', body.attemptId)
    .single();

  if (lookupErr || !attempt) {
    return c.json({ error: 'Attempt not found' }, 404);
  }

  if (attempt.user_id !== userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const key = `recordings/${userId}/${body.attemptId}.webm`;
  const uploadUrl = await getSignedUploadUrl(c.env, key, 300);

  return c.json({ uploadUrl, key });
});

export default v1;
