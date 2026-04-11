/**
 * Client-side security utilities for Velvet's "Fortress of Trust"
 */

export interface ShieldKeys {
  publicKey: string;
  privateKey: string;
}

/**
 * Generates an RSA-OAEP keypair for E2EE.
 * Exported as Base64 strings (SPKI for public, PKCS8 for private).
 */
export async function generateShieldKeys(): Promise<ShieldKeys> {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  const publicKeyBuffer = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
  const privateKeyBuffer = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

  return {
    publicKey: arrayBufferToBase64(publicKeyBuffer),
    privateKey: arrayBufferToBase64(privateKeyBuffer),
  };
}

/**
 * Stores keys locally. 
 * WARNING: In a production app, the Private Key should be encrypted 
 * with a user passphrase before being saved to storage.
 */
export function storeLocalKeys(keys: ShieldKeys) {
  localStorage.setItem('velvet_shield_public', keys.publicKey);
  localStorage.setItem('velvet_shield_private', keys.privateKey);
}

export function getLocalKeys(): ShieldKeys | null {
  const publicKey = localStorage.getItem('velvet_shield_public');
  const privateKey = localStorage.getItem('velvet_shield_private');
  
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey };
}

// Helper: Convert ArrayBuffer to Base64 string
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}
