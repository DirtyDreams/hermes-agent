import { useCallback, useRef } from 'react'
import sodium from 'libsodium-wrappers-sumo'

interface KeyPair {
  publicKey: string  // base64
  privateKey: string // base64, stored in sessionStorage
}

export function useEncryption() {
  const initialized = useRef(false)

  const initialize = useCallback(async (): Promise<KeyPair> => {
    await sodium.ready
    initialized.current = true

    // Restore from sessionStorage if exists
    const storedSk = sessionStorage.getItem('velvet_sk')
    const storedPk = sessionStorage.getItem('velvet_pk')
    if (storedSk && storedPk) {
      return { publicKey: storedPk, privateKey: storedSk }
    }

    // Generate new keypair
    const keypair = sodium.crypto_box_keypair()
    const publicKey = sodium.to_base64(keypair.publicKey)
    const privateKey = sodium.to_base64(keypair.privateKey)

    sessionStorage.setItem('velvet_pk', publicKey)
    sessionStorage.setItem('velvet_sk', privateKey)

    return { publicKey, privateKey }
  }, [])

  const encryptMessage = useCallback(async (
    message: string,
    recipientPublicKeyBase64: string
  ): Promise<{ encryptedContent: string; nonce: string }> => {
    await sodium.ready
    const sk = sessionStorage.getItem('velvet_sk')
    if (!sk) throw new Error('Keys not initialized')

    const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES)
    const recipientPk = sodium.from_base64(recipientPublicKeyBase64)
    const myPrivKey = sodium.from_base64(sk)

    const encrypted = sodium.crypto_box_easy(message, nonce, recipientPk, myPrivKey)

    return {
      encryptedContent: sodium.to_base64(encrypted),
      nonce: sodium.to_base64(nonce),
    }
  }, [])

  const decryptMessage = useCallback(async (
    encryptedContentBase64: string,
    nonceBase64: string,
    senderPublicKeyBase64: string
  ): Promise<string> => {
    await sodium.ready
    const sk = sessionStorage.getItem('velvet_sk')
    if (!sk) throw new Error('Keys not initialized')

    const encrypted = sodium.from_base64(encryptedContentBase64)
    const nonce = sodium.from_base64(nonceBase64)
    const senderPk = sodium.from_base64(senderPublicKeyBase64)
    const myPrivKey = sodium.from_base64(sk)

    const decrypted = sodium.crypto_box_open_easy(encrypted, nonce, senderPk, myPrivKey)
    return sodium.to_string(decrypted)
  }, [])

  return { initialize, encryptMessage, decryptMessage }
}
