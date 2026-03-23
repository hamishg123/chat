import crypto from 'crypto';

/**
 * Hash a password using PBKDF2
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a hash
 */
export function verifyPassword(password: string, hash: string): boolean {
  const [salt, storedHash] = hash.split(':');
  if (!salt || !storedHash) return false;
  
  const computed = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
  return computed === storedHash;
}

/**
 * Generate a random 6-digit verification code
 */
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Generate a random handle suggestion
 */
export function generateHandleSuggestion(): string {
  const adjectives = ['swift', 'bright', 'clever', 'happy', 'quick', 'bold', 'calm', 'cool', 'kind', 'wise'];
  const nouns = ['fox', 'eagle', 'lion', 'tiger', 'wolf', 'bear', 'hawk', 'raven', 'panda', 'otter'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 1000);
  return `${adj}${noun}${num}`;
}
