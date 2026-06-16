import * as jose from 'jose';

let jwksInstance: ReturnType<typeof jose.createRemoteJWKSet> | null = null;

function getJWKS(supabaseUrl: string) {
  if (!jwksInstance) {
    jwksInstance = jose.createRemoteJWKSet(
      new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
    );
  }
  return jwksInstance;
}

export async function verifySupabaseJwt(
  token: string,
  supabaseUrl: string,
): Promise<string | null> {
  try {
    const jwks = getJWKS(supabaseUrl);
    const { payload } = await jose.jwtVerify(token, jwks, {
      issuer: supabaseUrl,
      audience: 'authenticated',
    });
    return (payload.sub as string) ?? null;
  } catch {
    return null;
  }
}
