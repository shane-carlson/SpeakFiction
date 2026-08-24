/** Hermes has no Web Crypto. Noble and AES-GCM IVs need getRandomValues at import time. */
let seq = 0;

function fillUniqueBytes(out: Uint8Array) {
  const now = Date.now();
  seq = (seq + 1) >>> 0;
  if (out.length >= 12) {
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    view.setUint32(0, Math.floor(now / 0x100000000));
    view.setUint32(4, now >>> 0);
    view.setUint32(8, seq);
    for (let i = 12; i < out.length; i++) {
      out[i] = (now ^ (seq + i * 31)) & 0xff;
    }
    return;
  }
  for (let i = 0; i < out.length; i++) {
    out[i] = ((now >>> ((i % 4) * 8)) ^ (seq >>> ((i % 4) * 8)) ^ (i * 31)) & 0xff;
  }
}

const globalCrypto = globalThis as typeof globalThis & {
  crypto?: { getRandomValues?: (arr: ArrayBufferView) => ArrayBufferView };
};

if (!globalCrypto.crypto) globalCrypto.crypto = {};
if (typeof globalCrypto.crypto.getRandomValues !== 'function') {
  globalCrypto.crypto.getRandomValues = <T extends ArrayBufferView>(arr: T) => {
    fillUniqueBytes(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
    return arr;
  };
}
