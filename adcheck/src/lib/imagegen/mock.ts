import "server-only";
import { deflateSync } from "node:zlib";
import type { ImageProvider } from "./types";

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Solid-colour 512×512 PNG, so the flow can be tested without an image API key. */
export const mockProvider: ImageProvider = {
  name: "mock",
  async generate() {
    const size = 512;
    const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, Buffer.from([0x2f, 0x6f, 0xed]))]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr.set([8, 2, 0, 0, 0], 8);
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(Buffer.concat(Array(size).fill(row)))),
      chunk("IEND", Buffer.alloc(0)),
    ]);
    return { bytes: new Uint8Array(png), mediaType: "image/png" };
  },
};
