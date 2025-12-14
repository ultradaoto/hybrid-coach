import { jsonResponse } from './cors';

export type Role = 'coach' | 'client' | 'admin';

export interface AuthUser {
  id: string;
  role?: Role;
  email?: string;
}

export type AuthResult =
  | { success: true; user: AuthUser }
  | { success: false; response: Response };

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function base64UrlToBytes(input: string): Uint8Array {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const str = atob(base64 + pad);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

function decodeJson<T>(b64Url: string): T {
  const bytes = base64UrlToBytes(b64Url);
  const json = textDecoder.decode(bytes);
  return JSON.parse(json) as T;
}

async function verifyHs256Jwt(token: string, secret: string): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWT');

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJson<{ alg?: string; typ?: string }>(encodedHeader);
  if (header.alg !== 'HS256') throw new Error('Unsupported JWT alg');

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret) as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    base64UrlToBytes(encodedSignature) as unknown as BufferSource,
    textEncoder.encode(signingInput) as unknown as BufferSource
  );

  if (!ok) throw new Error('Invalid JWT signature');

  const payload = decodeJson<Record<string, unknown>>(encodedPayload);
  const exp = payload.exp;
  if (typeof exp === 'number') {
    const now = Math.floor(Date.now() / 1000);
    if (now >= exp) throw new Error('JWT expired');
  }

  return payload;
}

function unauthorized(message = 'Unauthorized'): AuthResult {
  return {
    success: false,
    response: jsonResponse({ success: false, error: message }, { status: 401 }),
  };
}

function forbidden(message = 'Forbidden'): AuthResult {
  return {
    success: false,
    response: jsonResponse({ success: false, error: message }, { status: 403 }),
  };
}

export async function authMiddleware(req: Request, requiredRole?: Role): Promise<AuthResult> {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
    return unauthorized('Missing bearer token');
  }

  const token = auth.slice(7).trim();
  const secret = process.env.JWT_SECRET ?? 'devsecret';

  let payload: Record<string, unknown>;
  try {
    payload = await verifyHs256Jwt(token, secret);
  } catch {
    return unauthorized('Invalid token');
  }

  const sub = payload.sub;
  if (typeof sub !== 'string' || !sub) {
    return unauthorized('Invalid token payload');
  }

  const role = payload.role;
  const userRole = typeof role === 'string' ? (role as Role) : undefined;
  if (requiredRole && userRole && userRole !== requiredRole) {
    return forbidden('Insufficient role');
  }
  if (requiredRole && !userRole) {
    return forbidden('Missing role in token');
  }

  const email = payload.email;
  return {
    success: true,
    user: {
      id: sub,
      role: userRole,
      email: typeof email === 'string' ? email : undefined,
    },
  };
}
