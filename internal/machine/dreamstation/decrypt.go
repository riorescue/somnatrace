// Copyright (c) 2026 Josh Perkins and the SomnaTrace contributors.
// SPDX-License-Identifier: MIT

package dreamstation

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"io"
	"os"
)

// DS2 encryption constants. The OSCAR key is the 32-byte ASCII string used as
// the outer decryption key. The common key is stored encrypted with that key;
// together they enable per-file key derivation using PBKDF2-SHA256.
var (
	ds2OscarKey     = []byte("Patient access to their own data")
	ds2CommonKeyEnc = []byte{
		0x75, 0xB3, 0xA2, 0x12, 0x4A, 0x65, 0xAF, 0x97,
		0x54, 0xD8, 0xC1, 0xF3, 0xE5, 0x2E, 0xB6, 0xF0,
		0x23, 0x20, 0x57, 0x69, 0x7E, 0x38, 0x0E, 0xC9,
		0x4A, 0xDC, 0x46, 0x45, 0xB6, 0x92, 0x5A, 0x98,
	}
)

// ds2CommonKey is the decrypted intermediate key, computed once at startup.
var ds2CommonKey []byte

func init() {
	var err error
	ds2CommonKey, err = aes256ECBDecrypt(ds2OscarKey, ds2CommonKeyEnc)
	if err != nil {
		panic("dreamstation: ds2 common key derivation failed: " + err.Error())
	}
}

// DS2KeyCache caches derived payload keys indexed by (iv+salt+export_key+tag)
// to avoid repeated PBKDF2 computations across files in the same session.
type DS2KeyCache map[string][]byte

// DecryptDS2File opens a DreamStation 2 encrypted file, decrypts the payload,
// and returns the decrypted bytes. keyCache should be shared across all files
// in a single import to avoid redundant PBKDF2 iterations.
func DecryptDS2File(path string, keyCache DS2KeyCache) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("ds2: open %s: %w", path, err)
	}
	defer f.Close()
	return decryptDS2Reader(f, keyCache)
}

func decryptDS2Reader(r io.Reader, keyCache DS2KeyCache) ([]byte, error) {
	// ── Parse the fixed 0xCA-byte DS2 header ──────────────────────────
	if err := expectRead16(r, 0x0D); err != nil {
		return nil, fmt.Errorf("ds2: %w", err)
	}
	if err := expectRead16(r, 1); err != nil {
		return nil, fmt.Errorf("ds2: %w", err)
	}
	if err := expectRead16(r, 1); err != nil {
		return nil, fmt.Errorf("ds2: %w", err)
	}

	guid, err := readLenBytes(r)
	if err != nil {
		return nil, fmt.Errorf("ds2: read guid: %w", err)
	}
	_ = guid

	iv, err := readLenBytes(r)
	if err != nil {
		return nil, fmt.Errorf("ds2: read iv: %w", err)
	}
	salt, err := readLenBytes(r)
	if err != nil {
		return nil, fmt.Errorf("ds2: read salt: %w", err)
	}

	// Two padding uint16s (0, 1).
	if _, err := read16(r); err != nil {
		return nil, fmt.Errorf("ds2: padding1: %w", err)
	}
	if _, err := read16(r); err != nil {
		return nil, fmt.Errorf("ds2: padding2: %w", err)
	}

	// import_key / import_key_tag are device-specific; we use the export path.
	importKey, err := readLenBytes(r)
	if err != nil {
		return nil, fmt.Errorf("ds2: read import_key: %w", err)
	}
	_ = importKey
	importKeyTag, err := readLenBytes(r)
	if err != nil {
		return nil, fmt.Errorf("ds2: read import_key_tag: %w", err)
	}
	_ = importKeyTag

	exportKey, err := readLenBytes(r)
	if err != nil {
		return nil, fmt.Errorf("ds2: read export_key: %w", err)
	}
	exportKeyTag, err := readLenBytes(r)
	if err != nil {
		return nil, fmt.Errorf("ds2: read export_key_tag: %w", err)
	}
	payloadTag, err := readLenBytes(r)
	if err != nil {
		return nil, fmt.Errorf("ds2: read payload_tag: %w", err)
	}

	// ── Derive the payload key (possibly cached) ───────────────────────
	cacheKey := string(iv) + string(salt) + string(exportKey) + string(exportKeyTag)
	payloadKey, ok := keyCache[cacheKey]
	if !ok {
		saltedKey := pbkdf2SHA256(ds2CommonKey, salt, 10000, 32)
		payloadKey, err = aes256GCMDecrypt(saltedKey, iv, exportKey, exportKeyTag)
		if err != nil {
			return nil, fmt.Errorf("ds2: derive payload key: %w", err)
		}
		keyCache[cacheKey] = payloadKey
	}

	// ── Decrypt the payload ────────────────────────────────────────────
	ciphertext, err := io.ReadAll(r)
	if err != nil {
		return nil, fmt.Errorf("ds2: read ciphertext: %w", err)
	}
	plaintext, err := aes256GCMDecrypt(payloadKey, iv, ciphertext, payloadTag)
	if err != nil {
		return nil, fmt.Errorf("ds2: decrypt payload: %w", err)
	}
	return plaintext, nil
}

// ── Crypto primitives ──────────────────────────────────────────────────────

// aes256ECBDecrypt decrypts data (multiple of 16 bytes) with key using
// AES-256-ECB (block-by-block, no chaining).
func aes256ECBDecrypt(key, data []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	bs := block.BlockSize()
	if len(data)%bs != 0 {
		return nil, fmt.Errorf("data length %d not a multiple of block size %d", len(data), bs)
	}
	out := make([]byte, len(data))
	for i := 0; i < len(data); i += bs {
		block.Decrypt(out[i:i+bs], data[i:i+bs])
	}
	return out, nil
}

// aes256GCMDecrypt decrypts ciphertext using AES-256-GCM, verifying tag.
func aes256GCMDecrypt(key, nonce, ciphertext, tag []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCMWithNonceSize(block, len(nonce))
	if err != nil {
		return nil, err
	}
	// Go's GCM Open expects ciphertext || tag concatenated.
	ct := make([]byte, len(ciphertext)+len(tag))
	copy(ct, ciphertext)
	copy(ct[len(ciphertext):], tag)
	return gcm.Open(nil, nonce, ct, nil)
}

// pbkdf2SHA256 derives a key using PBKDF2-HMAC-SHA256 (RFC 2898).
func pbkdf2SHA256(password, salt []byte, iterations, keyLen int) []byte {
	mac := hmac.New(sha256.New, password)
	hLen := mac.Size()
	blocks := (keyLen + hLen - 1) / hLen
	dk := make([]byte, blocks*hLen)
	buf := make([]byte, 4)
	for blk := 1; blk <= blocks; blk++ {
		binary.BigEndian.PutUint32(buf, uint32(blk))
		mac.Reset()
		mac.Write(salt)
		mac.Write(buf)
		U := mac.Sum(nil)
		T := make([]byte, hLen)
		copy(T, U)
		for i := 1; i < iterations; i++ {
			mac.Reset()
			mac.Write(U)
			U = mac.Sum(nil)
			for j := range T {
				T[j] ^= U[j]
			}
		}
		copy(dk[(blk-1)*hLen:], T)
	}
	return dk[:keyLen]
}

// ── Header parsing helpers ─────────────────────────────────────────────────

func read16(r io.Reader) (int, error) {
	var buf [2]byte
	if _, err := io.ReadFull(r, buf[:]); err != nil {
		return 0, err
	}
	return int(buf[0]) | int(buf[1])<<8, nil
}

func expectRead16(r io.Reader, want int) error {
	v, err := read16(r)
	if err != nil {
		return err
	}
	if v != want {
		return fmt.Errorf("expected 0x%x got 0x%x", want, v)
	}
	return nil
}

func readLenBytes(r io.Reader) ([]byte, error) {
	n, err := read16(r)
	if err != nil {
		return nil, err
	}
	if n == 0 {
		return nil, nil
	}
	buf := make([]byte, n)
	if _, err := io.ReadFull(r, buf); err != nil {
		return nil, err
	}
	return buf, nil
}
