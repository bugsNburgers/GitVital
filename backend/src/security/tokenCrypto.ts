import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const ENCODING_VERSION = 'v1';

function parseEncryptionKey(rawKey: string): Buffer {
    const trimmed = rawKey.trim();

    // Preferred format: base64-encoded 32-byte key.
    try {
        const base64 = Buffer.from(trimmed, 'base64');
        if (base64.length === 32) {
            return base64;
        }
    } catch {
        // Continue to other formats.
    }

    // Alternative: 64-char hex key.
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
        return Buffer.from(trimmed, 'hex');
    }

    // Strict fallback: raw UTF-8 string exactly 32 bytes.
    const utf8 = Buffer.from(trimmed, 'utf8');
    if (utf8.length === 32) {
        return utf8;
    }

    throw new Error('Invalid ENCRYPTION_KEY: expected 32-byte key (base64, hex-64, or utf8-32).');
}

function b64(input: Buffer): string {
    return input.toString('base64url');
}

function unb64(input: string): Buffer {
    return Buffer.from(input, 'base64url');
}

export function encryptAccessToken(plainToken: string, rawKey: string): string {
    if (!plainToken || !plainToken.trim()) {
        throw new Error('Cannot encrypt an empty access token.');
    }

    const key = parseEncryptionKey(rawKey);
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGO, key, iv);

    const ciphertext = Buffer.concat([
        cipher.update(plainToken, 'utf8'),
        cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();
    return `${ENCODING_VERSION}:${b64(iv)}:${b64(authTag)}:${b64(ciphertext)}`;
}

export function decryptAccessToken(encodedToken: string, rawKey: string): string {
    const parts = encodedToken.split(':');
    if (parts.length !== 4 || parts[0] !== ENCODING_VERSION) {
        throw new Error('Invalid encrypted token format.');
    }

    const [, ivPart, tagPart, dataPart] = parts;
    const iv = unb64(ivPart);
    const authTag = unb64(tagPart);
    const ciphertext = unb64(dataPart);

    if (iv.length !== IV_BYTES) {
        throw new Error('Invalid encrypted token IV length.');
    }

    if (authTag.length !== AUTH_TAG_BYTES) {
        throw new Error('Invalid encrypted token auth tag length.');
    }

    const key = parseEncryptionKey(rawKey);

    try {
        const decipher = crypto.createDecipheriv(ALGO, key, iv);
        decipher.setAuthTag(authTag);
        const plain = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final(),
        ]);
        return plain.toString('utf8');
    } catch {
        throw new Error('Failed to decrypt access token.');
    }
}
