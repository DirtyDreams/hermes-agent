import { describe, it, expect } from 'vitest'
import sodium from 'libsodium-wrappers-sumo'

describe('libsodium box encryption', () => {
  it('encrypts and decrypts a message', async () => {
    await sodium.ready
    const aliceKeys = sodium.crypto_box_keypair()
    const bobKeys = sodium.crypto_box_keypair()
    const message = 'Hello, Bob!'
    const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES)

    const encrypted = sodium.crypto_box_easy(
      message,
      nonce,
      bobKeys.publicKey,
      aliceKeys.privateKey
    )

    const decrypted = sodium.crypto_box_open_easy(
      encrypted,
      nonce,
      aliceKeys.publicKey,
      bobKeys.privateKey
    )

    expect(sodium.to_string(decrypted)).toBe(message)
  })
})
