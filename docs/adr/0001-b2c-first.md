# B2C-first launch with future B2B tenant upgrade path

**Status**: Accepted (future scope — do not implement now)

**Decision**: The platform launches as B2C only — a global practice section open to any registered user. All users are public users (`tenant_id=NULL` in `user_profiles`). The B2B multi-tenant path (training centers owning Real questions) is deferred until after the B2C product is shipped and validated.

**Why**: The schema already supports it — `tenant_id` is nullable on both `user_profiles` and `questions`, and `tenants` table exists. No schema migration is needed when B2B is added later. The current vertical slice (Read Aloud Player) gains nothing from multi-tenancy.

**Future B2B path** (informational, not a build plan): Registered users will apply/subscribe to join a training center's tenant. Approval is manual by tenant admin. On approval, `user_profiles.tenant_id` is set. Real questions (`is_ai_generated=false`) become visible to that user via the tenant-scoped RLS policies already in place.

**Considered alternative**: Build multi-tenant B2B from day one alongside B2C — rejected because it adds signup complexity, admin UI, and tenant management for zero early users.
