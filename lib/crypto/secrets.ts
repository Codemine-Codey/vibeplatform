import crypto from 'crypto'

// AES-256-GCM encryption for project secrets at rest. Uses the existing 64-char hex
// AI_KEY_ENCRYPTION_SECRET (32 bytes) as the key. GCM gives confidentiality + an auth
// tag (tamper detection). Stored as "iv:tag:ciphertext" hex. Secret VALUES never leave
// the server — the client only ever sees secret NAMES.
function getKey(): Buffer {
  const raw = (process.env.SECRETS_ENCRYPTION_KEY || process.env.AI_KEY_ENCRYPTION_SECRET || '').trim()
  // Accept a 64-char hex (preferred) or derive a stable 32-byte key from any string.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex')
  return crypto.createHash('sha256').update(raw || 'codemine-dev-fallback').digest()
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

export function decryptSecret(payload: string): string {
  const [ivh, tagh, ench] = payload.split(':')
  if (!ivh || !tagh || !ench) throw new Error('malformed secret')
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivh, 'hex'))
  decipher.setAuthTag(Buffer.from(tagh, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(ench, 'hex')), decipher.final()]).toString('utf8')
}
