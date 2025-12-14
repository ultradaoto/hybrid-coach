const textEncoder = new TextEncoder();

export function randomToken(bytes = 24) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return base64UrlEncodeBytes(b);
}

export function base64UrlEncodeBytes(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlEncodeJson(obj: unknown) {
  return base64UrlEncodeBytes(textEncoder.encode(JSON.stringify(obj)));
}

export async function hmacSha256Base64Url(input: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, textEncoder.encode(input));
  return base64UrlEncodeBytes(new Uint8Array(sig));
}

export async function pbkdf2Sha256(password: string, salt: string, iterations = 200_000) {
  const keyMaterial = await crypto.subtle.importKey('raw', textEncoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: textEncoder.encode(salt),
      iterations,
    },
    keyMaterial,
    256
  );
  return base64UrlEncodeBytes(new Uint8Array(bits));
}
