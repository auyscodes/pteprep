-- =============================================================================
-- Practice Sessions & Attempts — Schema
-- Created from grill-with-docs session, 2026-06-15
-- =============================================================================

-- =============================================================================
-- 1. PRACTICE SESSIONS
-- =============================================================================
CREATE TABLE practice_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at    TIMESTAMPTZ
);

-- =============================================================================
-- 2. PRACTICE ATTEMPTS
-- =============================================================================
CREATE TABLE practice_attempts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
    question_id     UUID NOT NULL REFERENCES questions(id),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    question_type   question_type_enum NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','uploaded','scoring','completed','failed')),
    recording_url   TEXT,           -- R2 key, not full URL
    duration_ms     INTEGER,        -- submitted recording length in milliseconds
    score           JSONB,
    error_detail    JSONB,          -- scoring failure reason (debugging only, never shown to users)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 3. INDEXES
-- =============================================================================
CREATE INDEX idx_practice_attempts_session_id  ON practice_attempts(session_id);
CREATE INDEX idx_practice_attempts_question_id ON practice_attempts(question_id);
CREATE INDEX idx_practice_attempts_user_id     ON practice_attempts(user_id);
CREATE INDEX idx_practice_attempts_user_type   ON practice_attempts(user_id, question_type);

CREATE INDEX idx_practice_sessions_user_id ON practice_sessions(user_id);

-- =============================================================================
-- 4. AUTO-UPDATE updated_at TRIGGER (practice_attempts)
-- =============================================================================
CREATE TRIGGER trg_practice_attempts_updated_at
    BEFORE UPDATE ON practice_attempts
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- =============================================================================
-- 5. ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE practice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_attempts ENABLE ROW LEVEL SECURITY;

-- Sessions: users can only read/write their own
CREATE POLICY "Users can manage own sessions"
    ON practice_sessions FOR ALL
    USING (auth.uid() = user_id);

-- Attempts: users can only read/write their own
CREATE POLICY "Users can manage own attempts"
    ON practice_attempts FOR ALL
    USING (auth.uid() = user_id);

-- =============================================================================
-- 6. GRANTS
-- =============================================================================
GRANT ALL ON public.practice_sessions TO service_role;
GRANT ALL ON public.practice_attempts TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.practice_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.practice_attempts TO authenticated;
