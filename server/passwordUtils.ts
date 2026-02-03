import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

export interface HashedPassword {
  hash: string;
  salt: string;
}

/**
 * Hash a password using scrypt with a random salt
 */
export function hashPassword(password: string): HashedPassword {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

/**
 * Verify a password against a stored hash and salt
 */
export function verifyPassword(password: string, storedHash: string, storedSalt: string): boolean {
  const hash = scryptSync(password, storedSalt, 64);
  const storedHashBuffer = Buffer.from(storedHash, 'hex');
  return timingSafeEqual(hash, storedHashBuffer);
}

/**
 * Initialize the admin password if it doesn't exist
 * Returns true if password was initialized, false if it already exists
 */
export async function initializeAdminPassword(storage: any): Promise<boolean> {
  try {
    const existingPassword = await storage.getAdminSetting('admin_password_hash');
    if (existingPassword) {
      return false; // Password already exists
    }

    // Set default password "admin123"
    const { hash, salt } = hashPassword('admin123');
    await storage.setAdminSetting('admin_password_hash', hash);
    await storage.setAdminSetting('admin_password_salt', salt);
    
    console.log('Admin password initialized with default: admin123');
    return true;
  } catch (error) {
    console.error('Failed to initialize admin password:', error);
    return false;
  }
}