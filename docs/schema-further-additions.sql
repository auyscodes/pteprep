-- Grant full access to service_role on all your tables
GRANT ALL ON public.questions TO service_role;
GRANT ALL ON public.question_sources TO service_role;
GRANT ALL ON public.tenants TO service_role;
GRANT ALL ON public.user_profiles TO service_role;

-- Also grant usage on the sequence for UUID generation (just in case)
GRANT USAGE ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

-- Grant select on questions to anon and authenticated (for RLS-filtered reads)
GRANT SELECT ON public.questions TO anon;
GRANT SELECT ON public.questions TO authenticated;
GRANT SELECT ON public.tenants TO authenticated;
GRANT SELECT ON public.user_profiles TO authenticated;
GRANT UPDATE ON public.user_profiles TO authenticated;