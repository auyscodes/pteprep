-- =============================================================================
-- PTE Practice Platform — PostgreSQL Schema (Supabase Multi-Tenant Ready)
-- Final Corrected Version
-- =============================================================================

-- =============================================================================
-- 1. ENUMS
-- =============================================================================
CREATE TYPE question_type_enum AS ENUM (
    'answer_short', 'read_aloud', 'repeat_sentence', 'retell_lecture', 
    'describe_image', 'respond_situation', 'write_essay', 'summarize_written', 
    'summarize_discussion', 'reading_fib_dragdrop', 'reading_fib_dropdown', 
    'reorder_paragraphs', 'reading_mcs', 'reading_mcm', 'highlight_incorrect', 
    'highlight_summary', 'listening_mcs', 'listening_mcm', 'listening_fib', 
    'select_missing_word', 'write_from_dictation', 'summarize_spoken_text'
);

CREATE TYPE difficulty_enum AS ENUM ('easy', 'medium', 'hard');
CREATE TYPE cefr_enum AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');
CREATE TYPE clone_status_enum AS ENUM ('pending_review', 'approved', 'rejected', 'failed');

-- =============================================================================
-- 2. TENANTS TABLE (B2B Training Centers)
-- =============================================================================
CREATE TABLE tenants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    slug        VARCHAR(100) UNIQUE NOT NULL,
    is_active   BOOLEAN DEFAULT TRUE,
    plan        VARCHAR(50) DEFAULT 'center',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 3. USER PROFILES TABLE (Supabase Auth Extension)
-- =============================================================================
CREATE TABLE user_profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id   UUID REFERENCES tenants(id),
    role        VARCHAR(50) DEFAULT 'student',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 4. MAIN QUESTIONS TABLE
-- =============================================================================
CREATE TABLE questions (
    -- Identity & Visibility
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_type       question_type_enum NOT NULL,
    is_ai_generated     BOOLEAN NOT NULL DEFAULT FALSE,
    is_public           BOOLEAN NOT NULL DEFAULT FALSE,
    tenant_id           UUID REFERENCES tenants(id),
    
    -- Clone Lineage & Review (Only populated if is_ai_generated = TRUE)
    cloned_from         UUID REFERENCES questions(id),
    clone_status        clone_status_enum,
    clone_review_score  JSONB,  -- e.g., {"difficulty_match": 8, "content_soundness": 9}
    clone_fail_reason   TEXT,

    -- Categorisation & metadata
    topic_title         VARCHAR(255),       
    topic_tag           VARCHAR(100),       
    difficulty          difficulty_enum,    
    cefr_level          cefr_enum,          
    word_count          INT,                

    -- Media
    has_audio           BOOLEAN NOT NULL DEFAULT FALSE,
    has_image           BOOLEAN NOT NULL DEFAULT FALSE,
    media_url           VARCHAR(1000),      

    -- Core text content
    passage_text        TEXT,
    text_with_blanks    TEXT,
    question_text       TEXT,
    correct_answer      TEXT,
    model_answer        TEXT,
    swt_marked_passage  TEXT,

    -- Normalised interactive data (JSONB)
    choices             JSONB,
    paragraphs          JSONB,
    blueprint           JSONB NOT NULL DEFAULT '{}',
    
    -- PRIVATE TRACEABILITY
    source_ref          JSONB,

    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 5. QUESTION SOURCES TABLE (Private Traceability)
-- =============================================================================
CREATE TABLE question_sources (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id     UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    source_json     JSONB NOT NULL,         
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_question_sources_question_id ON question_sources(question_id);

-- =============================================================================
-- 6. INDEXES
-- =============================================================================
CREATE INDEX idx_questions_type         ON questions(question_type);
CREATE INDEX idx_questions_difficulty   ON questions(difficulty);
CREATE INDEX idx_questions_cefr         ON questions(cefr_level);
CREATE INDEX idx_questions_topic_tag    ON questions(topic_tag);
CREATE INDEX idx_questions_ai_generated ON questions(is_ai_generated);
CREATE INDEX idx_questions_has_audio    ON questions(has_audio);
CREATE INDEX idx_questions_has_image    ON questions(has_image);
CREATE INDEX idx_questions_tenant       ON questions(tenant_id);
CREATE INDEX idx_questions_is_public    ON questions(is_public);
CREATE INDEX idx_questions_cloned_from  ON questions(cloned_from);
CREATE INDEX idx_questions_clone_status ON questions(clone_status);

CREATE INDEX idx_questions_blueprint_gin  ON questions USING GIN (blueprint);
CREATE INDEX idx_questions_choices_gin    ON questions USING GIN (choices);
CREATE INDEX idx_question_sources_gin     ON question_sources USING GIN (source_json);

CREATE INDEX idx_questions_fts ON questions USING GIN (
    to_tsvector('english',
        COALESCE(passage_text,  '') || ' ' ||
        COALESCE(question_text, '') || ' ' ||
        COALESCE(topic_title,   '') || ' ' ||
        COALESCE(topic_tag,     '')
    )
);

-- =============================================================================
-- 7. ROW LEVEL SECURITY (RLS) & POLICIES
-- =============================================================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_sources ENABLE ROW LEVEL SECURITY;

-- Tenants: Users can view their own tenant's details
CREATE POLICY "Users can view their own tenant"
    ON tenants FOR SELECT
    USING (id = (SELECT tenant_id FROM user_profiles WHERE id = auth.uid()));

-- User Profiles: Users can view and update their own profile
CREATE POLICY "Users can view own profile"
    ON user_profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON user_profiles FOR UPDATE
    USING (auth.uid() = id);

-- Questions Policy 1: Public questions are visible to everyone
CREATE POLICY "Select public questions"
    ON questions FOR SELECT
    USING (is_public = TRUE);

-- Questions Policy 2: Tenant questions are visible ONLY to authenticated users of that tenant
CREATE POLICY "Select tenant questions"
    ON questions FOR SELECT
    USING (
        auth.role() = 'authenticated' AND
        tenant_id IS NOT NULL AND
        tenant_id = (
            SELECT tenant_id FROM user_profiles 
            WHERE id = auth.uid() 
            AND tenant_id IS NOT NULL
        )
    );

-- Question Sources: RLS enabled, zero policies = zero access via anon/authenticated keys.
-- Access ONLY via service_role key (Cloudflare Worker admin routes).
-- Do NOT add select policies here — this table must never be exposed to clients.

-- =============================================================================
-- 8. AUTO-UPDATE updated_at TRIGGER
-- =============================================================================
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_questions_updated_at
    BEFORE UPDATE ON questions
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- =============================================================================
-- 9. SUPABASE AUTH TRIGGER (Auto-create profile on signup)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    INSERT INTO public.user_profiles (id, role)
    VALUES (NEW.id, 'student')
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- 10. PUBLIC VIEW (Security Invoker to enforce RLS, explicit columns to hide source_ref)
-- =============================================================================
CREATE VIEW public_questions
WITH (security_invoker = true)
AS
SELECT
    id, question_type, is_ai_generated, is_public, tenant_id,
    cloned_from, clone_status, clone_review_score, clone_fail_reason,
    topic_title, topic_tag, difficulty, cefr_level, word_count,
    has_audio, has_image, media_url, passage_text, text_with_blanks,
    question_text, correct_answer, model_answer, swt_marked_passage,
    choices, paragraphs, blueprint, created_at, updated_at
FROM questions;
-- source_ref is intentionally omitted