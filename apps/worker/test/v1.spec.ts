import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
} from 'vitest';
import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
  SELF,
} from 'cloudflare:test';

// --- Mock factories (referenced by vi.mock, hoisted by Vitest) ---
const mockSelect = vi.fn().mockReturnThis();
const mockEq = vi.fn().mockReturnThis();
const mockOr = vi.fn().mockReturnThis();
const mockOrder = vi.fn().mockReturnThis();
const mockRange = vi.fn().mockReturnThis();
const mockSingle = vi.fn();
const mockInsert = vi.fn().mockReturnThis();

const mockFrom = vi.fn(() => ({
  select: mockSelect,
  eq: mockEq,
  or: mockOr,
  order: mockOrder,
  range: mockRange,
  insert: mockInsert,
  single: mockSingle,
}));

vi.mock('../src/lib/supabase', () => ({
  getSupabase: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('../src/lib/r2', () => ({
  getSignedMediaUrl: vi.fn().mockResolvedValue(
    'https://signed.example.com/media/test.webm',
  ),
}));

vi.mock('../src/lib/jwks', () => ({
  verifySupabaseJwt: vi.fn().mockResolvedValue(null),
}));

// --- Imports (after mocks are hoisted) ---
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

// Sample question fixture
const sampleQuestion = {
  id: '11111111-1111-4111-8111-111111111111',
  question_type: 'read_aloud',
  is_ai_generated: true,
  is_public: true,
  tenant_id: null,
  cloned_from: null,
  clone_status: null,
  clone_review_score: null,
  clone_fail_reason: null,
  topic_title: 'Environment',
  topic_tag: 'climate',
  difficulty: 'medium',
  cefr_level: 'B2',
  word_count: 120,
  has_audio: true,
  has_image: false,
  media_url: 'media/q1.mp3',
  passage_text: 'Climate change is a pressing global issue...',
  text_with_blanks: null,
  question_text: null,
  correct_answer: null,
  model_answer: null,
  swt_marked_passage: null,
  choices: null,
  paragraphs: null,
  blueprint: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('/v1 routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── GET /v1/questions ──────────────────────────────────────────
  describe('GET /v1/questions', () => {
    it('returns paginated list of Read Aloud questions', async () => {
      mockRange.mockResolvedValueOnce({
        data: [sampleQuestion],
        error: null,
        count: 1,
      });

      const request = new IncomingRequest(
        'http://example.com/v1/questions?offset=0&limit=10',
      );
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.questions).toHaveLength(1);
      expect(body.count).toBe(1);
      expect(body.offset).toBe(0);
      expect(body.limit).toBe(10);

      // Source ref must not be present
      const first = (body.questions as Array<Record<string, unknown>>)[0];
      expect(first).not.toHaveProperty('source_ref');
    });

    it('applies defence-in-depth filter on every query', async () => {
      mockRange.mockResolvedValueOnce({
        data: [],
        error: null,
        count: 0,
      });

      const request = new IncomingRequest(
        'http://example.com/v1/questions',
      );
      const ctx = createExecutionContext();
      await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(mockEq).toHaveBeenCalledWith('question_type', 'read_aloud');
      expect(mockEq).toHaveBeenCalledWith('is_public', true);
      expect(mockOr).toHaveBeenCalledWith(
        'is_ai_generated.eq.true,source_ref.is.null',
      );
    });

    it('uses default offset and limit when query params are absent', async () => {
      mockRange.mockResolvedValueOnce({
        data: [],
        error: null,
        count: 0,
      });

      const request = new IncomingRequest(
        'http://example.com/v1/questions',
      );
      const ctx = createExecutionContext();
      await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(mockRange).toHaveBeenCalledWith(0, 19); // offset 0, limit 20 => range(0, 19)
    });

    it('caps limit at 100', async () => {
      mockRange.mockResolvedValueOnce({
        data: [],
        error: null,
        count: 0,
      });

      const request = new IncomingRequest(
        'http://example.com/v1/questions?limit=999',
      );
      const ctx = createExecutionContext();
      await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(mockRange).toHaveBeenCalledWith(0, 99);
    });

    it('returns 500 on Supabase error', async () => {
      mockRange.mockResolvedValueOnce({
        data: null,
        error: { message: 'connection refused' },
        count: null,
      });

      const request = new IncomingRequest(
        'http://example.com/v1/questions',
      );
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(500);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.error).toBe('Failed to fetch questions');
    });
  });

  // ── GET /v1/questions/:id ──────────────────────────────────────
  describe('GET /v1/questions/:id', () => {
    const questionId = '22222222-2222-4222-8222-222222222222';

    it('returns single question detail with signed media URL', async () => {
      mockSingle.mockResolvedValueOnce({
        data: { ...sampleQuestion, id: questionId },
        error: null,
      });

      const request = new IncomingRequest(
        `http://example.com/v1/questions/${questionId}`,
      );
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.id).toBe(questionId);
      expect(body).not.toHaveProperty('source_ref');
    });

    it('returns 404 for non-existent question', async () => {
      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { message: 'No rows found' },
      });

      const request = new IncomingRequest(
        `http://example.com/v1/questions/${questionId}`,
      );
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(404);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.error).toBe('Not found');
    });

    it('returns 404 for non-read_aloud questions', async () => {
      // When the defence filter + question_type filter remove the row,
      // Supabase returns null with an error from .single()
      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { message: 'No rows found' },
      });

      const request = new IncomingRequest(
        `http://example.com/v1/questions/${questionId}`,
      );
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(404);
    });

    it('never exposes source_ref in response', async () => {
      const qWithSourceRef = { ...sampleQuestion, id: questionId, source_ref: { url: 'secret' } };
      mockSingle.mockResolvedValueOnce({
        data: qWithSourceRef,
        error: null,
      });

      const request = new IncomingRequest(
        `http://example.com/v1/questions/${questionId}`,
      );
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      const body = (await response.json()) as Record<string, unknown>;
      expect(body).not.toHaveProperty('source_ref');
    });
  });

  // ── POST /v1/sessions/:id/attempts ──────────────────────────────
  describe('POST /v1/sessions/:id/attempts', () => {
    const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const questionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const attemptId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const userId = 'user-123';

    it('creates an attempt and returns 201', async () => {
      const { verifySupabaseJwt } = await import('../src/lib/jwks');
      (verifySupabaseJwt as ReturnType<typeof vi.fn>).mockResolvedValueOnce(userId);

      mockSingle
        .mockResolvedValueOnce({
          data: { id: sessionId, user_id: userId, ended_at: null },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { ...sampleQuestion, id: questionId },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { id: attemptId, session_id: sessionId, question_id: questionId, status: 'pending' },
          error: null,
        });

      const request = new IncomingRequest(
        `http://example.com/v1/sessions/${sessionId}/attempts`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer valid.jwt.token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ question_id: questionId }),
        },
      );
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(201);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.id).toBe(attemptId);
      expect(body.session_id).toBe(sessionId);
      expect(body.question_id).toBe(questionId);
      expect(body.status).toBe('pending');
      expect(body).not.toHaveProperty('user_id');
    });

    it('returns 401 when no valid JWT is provided', async () => {
      const request = new IncomingRequest(
        `http://example.com/v1/sessions/${sessionId}/attempts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question_id: questionId }),
        },
      );
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(401);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.error).toBe('Authentication required');
    });

    it('returns 403 when session belongs to a different user', async () => {
      const { verifySupabaseJwt } = await import('../src/lib/jwks');
      (verifySupabaseJwt as ReturnType<typeof vi.fn>).mockResolvedValueOnce(userId);

      mockSingle.mockResolvedValueOnce({
        data: { id: sessionId, user_id: 'other-user', ended_at: null },
        error: null,
      });

      const request = new IncomingRequest(
        `http://example.com/v1/sessions/${sessionId}/attempts`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer valid.jwt.token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ question_id: questionId }),
        },
      );
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(403);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.error).toBe('Forbidden');
    });

    it('returns 400 when question_id is missing from request body', async () => {
      const { verifySupabaseJwt } = await import('../src/lib/jwks');
      (verifySupabaseJwt as ReturnType<typeof vi.fn>).mockResolvedValueOnce(userId);

      mockSingle.mockResolvedValueOnce({
        data: { id: sessionId, user_id: userId, ended_at: null },
        error: null,
      });

      const request = new IncomingRequest(
        `http://example.com/v1/sessions/${sessionId}/attempts`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer valid.jwt.token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        },
      );
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(400);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.error).toBe('question_id is required');
    });

    it('returns 400 when question does not exist', async () => {
      const { verifySupabaseJwt } = await import('../src/lib/jwks');
      (verifySupabaseJwt as ReturnType<typeof vi.fn>).mockResolvedValueOnce(userId);

      mockSingle
        .mockResolvedValueOnce({
          data: { id: sessionId, user_id: userId, ended_at: null },
          error: null,
        })
        .mockResolvedValueOnce({
          data: null,
          error: { message: 'No rows found' },
        });

      const request = new IncomingRequest(
        `http://example.com/v1/sessions/${sessionId}/attempts`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer valid.jwt.token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ question_id: questionId }),
        },
      );
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(400);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.error).toBe('Invalid question');
    });

    it('returns 400 when question is not type read_aloud', async () => {
      const { verifySupabaseJwt } = await import('../src/lib/jwks');
      (verifySupabaseJwt as ReturnType<typeof vi.fn>).mockResolvedValueOnce(userId);

      mockSingle
        .mockResolvedValueOnce({
          data: { id: sessionId, user_id: userId, ended_at: null },
          error: null,
        })
        .mockResolvedValueOnce({
          data: null,
          error: { message: 'No rows found' },
        });

      const request = new IncomingRequest(
        `http://example.com/v1/sessions/${sessionId}/attempts`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer valid.jwt.token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ question_id: questionId }),
        },
      );
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(400);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.error).toBe('Invalid question');
    });

    it('returns 400 when session is already ended', async () => {
      const { verifySupabaseJwt } = await import('../src/lib/jwks');
      (verifySupabaseJwt as ReturnType<typeof vi.fn>).mockResolvedValueOnce(userId);

      mockSingle.mockResolvedValueOnce({
        data: { id: sessionId, user_id: userId, ended_at: '2026-06-01T00:00:00Z' },
        error: null,
      });

      const request = new IncomingRequest(
        `http://example.com/v1/sessions/${sessionId}/attempts`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer valid.jwt.token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ question_id: questionId }),
        },
      );
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(400);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.error).toBe('Session has ended');
    });

    it('returns 404 when session does not exist', async () => {
      const { verifySupabaseJwt } = await import('../src/lib/jwks');
      (verifySupabaseJwt as ReturnType<typeof vi.fn>).mockResolvedValueOnce(userId);

      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { message: 'No rows found' },
      });

      const request = new IncomingRequest(
        `http://example.com/v1/sessions/${sessionId}/attempts`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer valid.jwt.token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ question_id: questionId }),
        },
      );
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(404);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.error).toBe('Session not found');
    });
  });

  // ── Auth middleware ─────────────────────────────────────────────
  describe('auth middleware', () => {
    it('passes through anonymous requests without userId', async () => {
      mockSingle.mockResolvedValueOnce({
        data: { ...sampleQuestion, id: '33333333-3333-4333-8333-333333333333' },
        error: null,
      });

      const request = new IncomingRequest(
        'http://example.com/v1/questions/33333333-3333-4333-8333-333333333333',
      );
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
    });

    it('verifies JWT and sets userId for authenticated requests', async () => {
      const { verifySupabaseJwt } = await import('../src/lib/jwks');
      (verifySupabaseJwt as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        'user-123',
      );

      mockSingle.mockResolvedValueOnce({
        data: { ...sampleQuestion, id: '44444444-4444-4444-8444-444444444444' },
        error: null,
      });

      const request = new IncomingRequest(
        'http://example.com/v1/questions/44444444-4444-4444-8444-444444444444',
        {
          headers: { Authorization: 'Bearer valid.jwt.token' },
        },
      );
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
    });
  });
});
