import jwt from 'jsonwebtoken';

// Generate a JWT token with a specified expiry time
export function generateJwtWithExpiry(user, expiresIn = '1h') {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName
  };
  
  return jwt.sign(
    payload,
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn }
  );
} 