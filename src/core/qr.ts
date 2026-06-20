/**
 * qr — a small, dependency-free QR Code generator (byte mode), used to print a scannable link to
 * the online preview on the to-scale cut sheet (M7).
 *
 * This is a trimmed TypeScript port of Project Nayuki's "QR Code generator" (MIT licensed). It
 * supports byte-mode encoding across all versions (1–40) with automatic version selection, a fixed
 * error-correction level, and mask-pattern selection. Output is a square boolean matrix (`true` =
 * dark module) which the print layer renders as crisp SVG rects.
 */

/** Error-correction level. We use M (~15%) — good resilience without bloating the symbol. */
const ECC_M = { ordinal: 0, formatBits: 0 } as const;

// ── ECC + capacity tables (indexed by version 1..40) ────────────────────────────────────────────

// Number of error-correction codewords per block, for level M.
// prettier-ignore
const ECC_CODEWORDS_PER_BLOCK_M = [
  -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
  26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
];
// Number of error-correction blocks, for level M.
// prettier-ignore
const NUM_ERROR_CORRECTION_BLOCKS_M = [
  -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
  17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
];

const MIN_VERSION = 1;
const MAX_VERSION = 40;

// ── Reed–Solomon over GF(2^8) ───────────────────────────────────────────────────────────────────

function reedSolomonComputeDivisor(degree: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < degree - 1; i++) result.push(0);
  result.push(1);
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = reedSolomonMultiply(result[j]!, root);
      if (j + 1 < result.length) result[j] ^= result[j + 1]!;
    }
    root = reedSolomonMultiply(root, 0x02);
  }
  return result;
}

function reedSolomonComputeRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ result.shift()!;
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] ^= reedSolomonMultiply(coef, factor);
    });
  }
  return result;
}

function reedSolomonMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

// ── Bit buffer ──────────────────────────────────────────────────────────────────────────────────

function appendBits(val: number, len: number, bits: number[]): void {
  for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
}

// ── Layout helpers ──────────────────────────────────────────────────────────────────────────────

function getNumRawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

function getNumDataCodewords(ver: number): number {
  return (
    Math.floor(getNumRawDataModules(ver) / 8) -
    ECC_CODEWORDS_PER_BLOCK_M[ver]! * NUM_ERROR_CORRECTION_BLOCKS_M[ver]!
  );
}

function getAlignmentPatternPositions(ver: number): number[] {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = Math.floor((ver * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
  const result = [6];
  for (let pos = ver * 4 + 10; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

// ── QR code construction ────────────────────────────────────────────────────────────────────────

class QrMatrix {
  readonly size: number;
  /** Row-major module colours (true = dark). */
  readonly modules: boolean[][];
  private readonly isFunction: boolean[][];

  constructor(
    readonly version: number,
    readonly mask: number,
    dataCodewords: readonly number[],
  ) {
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => Array(this.size).fill(false) as boolean[]);
    this.isFunction = Array.from(
      { length: this.size },
      () => Array(this.size).fill(false) as boolean[],
    );

    this.drawFunctionPatterns();
    const allCodewords = this.addEccAndInterleave(dataCodewords);
    this.drawCodewords(allCodewords);
    this.applyMask(mask);
    this.drawFormatBits(mask);
  }

  private setFunctionModule(x: number, y: number, isDark: boolean): void {
    this.modules[y]![x] = isDark;
    this.isFunction[y]![x] = true;
  }

  private drawFunctionPatterns(): void {
    for (let i = 0; i < this.size; i++) {
      this.setFunctionModule(6, i, i % 2 === 0);
      this.setFunctionModule(i, 6, i % 2 === 0);
    }
    this.drawFinderPattern(3, 3);
    this.drawFinderPattern(this.size - 4, 3);
    this.drawFinderPattern(3, this.size - 4);

    const alignPos = getAlignmentPatternPositions(this.version);
    const numAlign = alignPos.length;
    for (let i = 0; i < numAlign; i++) {
      for (let j = 0; j < numAlign; j++) {
        if (!((i === 0 && j === 0) || (i === 0 && j === numAlign - 1) || (i === numAlign - 1 && j === 0)))
          this.drawAlignmentPattern(alignPos[i]!, alignPos[j]!);
      }
    }

    this.drawFormatBits(0);
    this.drawVersion();
  }

  private drawFinderPattern(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size)
          this.setFunctionModule(xx, yy, dist !== 2 && dist !== 4);
      }
    }
  }

  private drawAlignmentPattern(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++)
        this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }

  private drawFormatBits(mask: number): void {
    const data = (ECC_M.formatBits << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;

    for (let i = 0; i <= 5; i++) this.setFunctionModule(8, i, ((bits >>> i) & 1) !== 0);
    this.setFunctionModule(8, 7, ((bits >>> 6) & 1) !== 0);
    this.setFunctionModule(8, 8, ((bits >>> 7) & 1) !== 0);
    this.setFunctionModule(7, 8, ((bits >>> 8) & 1) !== 0);
    for (let i = 9; i < 15; i++) this.setFunctionModule(14 - i, 8, ((bits >>> i) & 1) !== 0);

    for (let i = 0; i < 8; i++) this.setFunctionModule(this.size - 1 - i, 8, ((bits >>> i) & 1) !== 0);
    for (let i = 8; i < 15; i++) this.setFunctionModule(8, this.size - 15 + i, ((bits >>> i) & 1) !== 0);
    this.setFunctionModule(8, this.size - 8, true);
  }

  private drawVersion(): void {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >>> i) & 1) !== 0;
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunctionModule(a, b, bit);
      this.setFunctionModule(b, a, bit);
    }
  }

  private addEccAndInterleave(data: readonly number[]): number[] {
    const ver = this.version;
    const numBlocks = NUM_ERROR_CORRECTION_BLOCKS_M[ver]!;
    const blockEccLen = ECC_CODEWORDS_PER_BLOCK_M[ver]!;
    const rawCodewords = Math.floor(getNumRawDataModules(ver) / 8);
    const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
    const shortBlockLen = Math.floor(rawCodewords / numBlocks);

    const blocks: number[][] = [];
    const rsDiv = reedSolomonComputeDivisor(blockEccLen);
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
      const dat = data.slice(k, k + datLen);
      k += datLen;
      const ecc = reedSolomonComputeRemainder(dat, rsDiv);
      if (i < numShortBlocks) dat.push(0);
      blocks.push(dat.concat(ecc));
    }

    const result: number[] = [];
    for (let i = 0; i < blocks[0]!.length; i++) {
      blocks.forEach((block, j) => {
        if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(block[i]!);
      });
    }
    return result;
  }

  private drawCodewords(data: readonly number[]): void {
    let i = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!this.isFunction[y]![x] && i < data.length * 8) {
            this.modules[y]![x] = ((data[i >>> 3]! >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }
  }

  private applyMask(mask: number): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        let invert: boolean;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: invert = false;
        }
        if (!this.isFunction[y]![x] && invert) this.modules[y]![x] = !this.modules[y]![x];
      }
    }
  }
}

// ── Public entrypoint ───────────────────────────────────────────────────────────────────────────

/** Encode `text` (UTF-8, byte mode) into a square boolean matrix (true = dark module). */
export function encodeQr(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);

  // Pick the smallest version that fits, at EC level M.
  let version = MIN_VERSION;
  let dataCapacityBits = 0;
  for (; ; version++) {
    if (version > MAX_VERSION) throw new Error('QR data too long');
    dataCapacityBits = getNumDataCodewords(version) * 8;
    const ccLen = version <= 9 ? 8 : 16; // byte-mode char-count length
    const usedBits = 4 + ccLen + bytes.length * 8;
    if (usedBits <= dataCapacityBits) break;
  }

  const bits: number[] = [];
  appendBits(0x4, 4, bits); // byte mode indicator
  appendBits(bytes.length, version <= 9 ? 8 : 16, bits);
  for (const b of bytes) appendBits(b, 8, bits);

  // Terminator + bit/byte padding.
  appendBits(0, Math.min(4, dataCapacityBits - bits.length), bits);
  appendBits(0, (8 - (bits.length % 8)) % 8, bits);
  for (let pad = 0xec; bits.length < dataCapacityBits; pad ^= 0xec ^ 0x11) appendBits(pad, 8, bits);

  const dataCodewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let cw = 0;
    for (let j = 0; j < 8; j++) cw = (cw << 1) | bits[i + j]!;
    dataCodewords.push(cw);
  }

  // Pick the mask with the lowest penalty.
  let best: QrMatrix | null = null;
  let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const m = new QrMatrix(version, mask, dataCodewords);
    const p = penalty(m);
    if (p < bestPenalty) {
      best = m;
      bestPenalty = p;
    }
  }
  return best!.modules;
}

// ── Mask penalty scoring (simplified but standard) ──────────────────────────────────────────────

function penalty(m: QrMatrix): number {
  const size = m.size;
  const mod = m.modules;
  let result = 0;

  // Adjacent runs (rows then columns).
  for (let y = 0; y < size; y++) {
    let run = 1;
    for (let x = 1; x < size; x++) {
      if (mod[y]![x] === mod[y]![x - 1]) {
        run++;
        if (run === 5) result += 3;
        else if (run > 5) result++;
      } else run = 1;
    }
  }
  for (let x = 0; x < size; x++) {
    let run = 1;
    for (let y = 1; y < size; y++) {
      if (mod[y]![x] === mod[y - 1]![x]) {
        run++;
        if (run === 5) result += 3;
        else if (run > 5) result++;
      } else run = 1;
    }
  }

  // 2×2 blocks.
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = mod[y]![x];
      if (c === mod[y]![x + 1] && c === mod[y + 1]![x] && c === mod[y + 1]![x + 1]) result += 3;
    }
  }

  // Dark proportion.
  let dark = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (mod[y]![x]) dark++;
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  result += k * 10;

  return result;
}
