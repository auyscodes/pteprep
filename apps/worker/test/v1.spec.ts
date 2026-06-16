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
const mockUpdate = vi.fn().mockReturnThis();
const mockIs = vi.fn().mockReturnThis();

const mockFrom = vi.fn(() => ({
  select: mockSelect,
  eq: mockEq,
  or: mockOr,
  order: mockOrder,
  range: mockRange,
  single: mockSingle,
  insert: mockInsert,
  update: mockUpdate,
  is: mockIs,
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

  // ── POST /v1/sessions ──────────────────────────────────────────
  describe('POST /v1/sessions', () => {
    const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    it('returns 401 when no JWT is provided', async () => {
      const request = new IncomingRequest('http://example.com/v1/sessions', {
        method: 'POST',
      });
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(401);
    });

    it('creates a session and returns 201 with id, user_id, created_at', async () => {
      const { verifySupabaseJwt } = await import('../src/lib/jwks');
      (verifySupabaseJwt as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        'user-123',
      );

      mockSingle.mockResolvedValueOnce({
        data: {
          id: sessionId,
          user_id: 'user-123',
          created_at: '2026-06-15T00:00:00Z',
        },
        error: null,
      });

      const request = new IncomingRequest('http://example.com/v1/sessions', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid.jwt.token' },
      });
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(201);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.id).toBe(sessionId);
      expect(body.user_id).toBe('user-123');
      expect(body.created_at).toBe('2026-06-15T00:00:00Z');

      expect(mockInsert).toHaveBeenCalledWith({ user_id: 'user-123' });
    });

    it('returns 401 when JWT is invalid', async () => {
      const { verifySupabaseJwt } = await import('../src/lib/jwks');
      (verifySupabaseJwt as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        null,
      );

      const request = new IncomingRequest('http://example.com/v1/sessions', {
        method: 'POST',
        headers: { Authorization: 'Bearer invalid.jwt' },
      });
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(401);
    });
  });

  // ── PATCH /v1/sessions/:id/end ────────────────────────────────
  describe('PATCH /v1/sessions/:id/end', () => {
    const sessionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    it('returns 401 when no JWT is provided', async () => {
      const request = new IncomingRequest(
        `http://example.com/v1/sessions/${sessionId}/end`,
        { method: 'PATCH' },
      );
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(401);
    });

    it('returns 404 for non-existent session', async () => {
      const { verifySupabaseJwt } = await import('../src/lib/jwks');
      (verifySupabaseJwt as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        'user-123',
      );

      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { message: 'No rows found' },
      });

      const request = new IncomingRequest(
        `http://example.com/v1/sessions/${sessionId}/end`,
        {
          method: 'PATCH',
          headers: { Authorization: 'Bearer valid.jwt.token' },
        },
      );
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(404);
    });

    it('returns 403 when session belongs to a different user', async () => {
      const { verifySupabaseJwt } = await import('../src/lib/jwks');
      (verifySupabaseJwt as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        'user-456',
      );

      mockSingle.mockResolvedValueOnce({
        data: {
          id: sessionId,
          user_id: 'other-user',
          created_at: '2026-06-15T00:00:00Z',
          ended_at: null,
        },
        error: null,
      });

      const request = new IncomingRequest(
        `http://example.com/v1/sessions/${sessionId}/end`,
        {
          method: 'PATCH',
          headers: { Authorization: 'Bearer valid.jwt.token' },
        },
      );
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(403);
    });

    it('ends a session and returns updated session', async () => {
      const { verifySupabaseJwt } = await import('../src/lib/jwks');
      (verifySupabaseJwt as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        'user-123',
      );

      // First call: fetch the session
      mockSingle.mockResolvedValueOnce({
        data: {
          id: sessionId,
          user_id: 'user-123',
          created_at: '2026-06-15T00:00:00Z',
          ended_at: null,
        },
        error: null,
      });

      // Second call: update the session
      mockSingle.mockResolvedValueOnce({
        data: {
          id: sessionId,
          user_id: 'user-123',
          created_at: '2026-06-15T00:00:00Z',
          ended_at: '2026-06-15T01:00:00Z',
        },
        error: null,
      });

      const request = new IncomingRequest(
        `http://example.com/v1/sessions/${sessionId}/end`,
        {
          method: 'PATCH',
          headers: { Authorization: 'Bearer valid.jwt.token' },
        },
      );
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.id).toBe(sessionId);
      expect(body.ended_at).toBe('2026-06-15T01:00:00Z');

      expect(mockUpdate).toHaveBeenCalled();
      expect(mockEq).toHaveBeenCalledWith('id', sessionId);
    });

    it('is idempotent — returns already-ended session without updating', async () => {
      const { verifySupabaseJwt } = await import('../src/lib/jwks');
      (verifySupabaseJwt as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        'user-123',
      );

      mockSingle.mockResolvedValueOnce({
        data: {
          id: sessionId,
          user_id: 'user-123',
          created_at: '2026-06-15T00:00:00Z',
          ended_at: '2026-06-15T01:00:00Z',
        },
        error: null,
      });

      const request = new IncomingRequest(
        `http://example.com/v1/sessions/${sessionId}/end`,
        {
          method: 'PATCH',
          headers: { Authorization: 'Bearer valid.jwt.token' },
        },
      );
      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.id).toBe(sessionId);
      expect(body.ended_at).toBe('2026-06-15T01:00:00Z');

      // Update should not have been called
      expect(mockUpdate).not.toHaveBeenCalled();
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
