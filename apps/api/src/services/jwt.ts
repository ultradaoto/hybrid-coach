import { base64UrlEncodeJson, hmacSha256Base64Url } from './crypto';

export type JwtRole = 'coach' | 'client' | 'admin';
export type JwtTier = 'FREE' | 'VAGUS_MEMBER' | 'PREMIUM';

export type JwtPayload = {
  sub: string;
  email?: string;
  role?: JwtRole;
  tier?: JwtTier;
  iat?: number;
  exp?: number;
};

export async function signHs256Jwt(payload: JwtPayload, secret: string, expiresInSeconds: number) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encodedHeader = base64UrlEncodeJson(header);
  const encodedPayload = base64UrlEncodeJson(body);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await hmacSha256Base64Url(signingInput, secret);
  return `${signingInput}.${signature}`;
}
