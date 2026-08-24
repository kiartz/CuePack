// Code 128 and QR Code Generators (Pure TypeScript, Zero External Dependencies)

// --- CODE 128B BARCODE GENERATOR ---
const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", // 0-9
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", // 10-19
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", // 20-29
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", // 30-39
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", // 40-49
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", // 50-59
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", // 60-69
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", // 70-79
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", // 80-89
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", // 90-99
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112" // 100-106 (104=StartB, 106=Stop)
];

export const generateBarcodeSVG = (text: string, height = 50, barWidth = 2): string => {
  if (!text) return '';
  const startCode = 104; // Start B
  let checksum = startCode;
  const codes = [startCode];

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) - 32;
    if (charCode >= 0 && charCode <= 95) {
      codes.push(charCode);
      checksum += charCode * (i + 1);
    }
  }

  codes.push(checksum % 103);
  codes.push(106); // Stop code

  let patternStr = '';
  codes.forEach(code => {
    patternStr += CODE128_PATTERNS[code] || '';
  });

  let svgBars = '';
  let x = 10; // Left padding
  let isBar = true;

  for (let i = 0; i < patternStr.length; i++) {
    const width = parseInt(patternStr[i], 10) * barWidth;
    if (isBar) {
      svgBars += `<rect x="${x}" y="0" width="${width}" height="${height}" fill="#000000" />`;
    }
    x += width;
    isBar = !isBar;
  }

  const totalWidth = x + 10; // Right padding
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${height + 20}" width="${totalWidth}" height="${height + 20}">
    <rect width="100%" height="100%" fill="#ffffff" />
    <g transform="translate(0, 5)">${svgBars}</g>
    <text x="${totalWidth / 2}" y="${height + 16}" text-anchor="middle" font-family="monospace" font-size="12" font-weight="bold" fill="#000000">${text}</text>
  </svg>`;
};

// --- COMPACT QR CODE GENERATOR (Byte Mode, ISO/IEC 18004) ---
// Generates standard QR Code matrices for strings up to 100 chars (Version 1-4)
class QRBitBuffer {
  buffer: number[] = [];
  length = 0;
  put(num: number, length: number) {
    for (let i = 0; i < length; i++) {
      this.putBit(((num >>> (length - i - 1)) & 1) === 1);
    }
  }
  putBit(bit: boolean) {
    const bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) {
      this.buffer.push(0);
    }
    if (bit) {
      this.buffer[bufIndex] |= (0x80 >>> (this.length % 8));
    }
    this.length++;
  }
}

class Polynomial {
  num: number[];
  constructor(num: number[], shift = 0) {
    let offset = 0;
    while (offset < num.length && num[offset] === 0) offset++;
    this.num = new Array(num.length - offset + shift);
    for (let i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
    for (let i = 0; i < shift; i++) this.num[this.num.length - shift + i] = 0;
  }
  get(index: number) { return this.num[index]; }
  getLength() { return this.num.length; }
  multiply(e: Polynomial) {
    const num = new Array(this.getLength() + e.getLength() - 1).fill(0);
    for (let i = 0; i < this.getLength(); i++) {
      for (let j = 0; j < e.getLength(); j++) {
        num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i)) + QRMath.glog(e.get(j)));
      }
    }
    return new Polynomial(num);
  }
  mod(e: Polynomial): Polynomial {
    if (this.getLength() - e.getLength() < 0) return this;
    const ratio = QRMath.glog(this.get(0)) - QRMath.glog(e.get(0));
    const num = new Array(this.getLength());
    for (let i = 0; i < this.getLength(); i++) num[i] = this.get(i);
    for (let i = 0; i < e.getLength(); i++) {
      num[i] ^= QRMath.gexp(QRMath.glog(e.get(i)) + ratio);
    }
    return new Polynomial(num).mod(e);
  }
}

const QRMath = {
  glog(n: number) {
    if (n < 1) throw new Error("glog(" + n + ")");
    return QRMath.LOG_TABLE[n];
  },
  gexp(n: number) {
    while (n < 0) n += 255;
    while (n >= 255) n -= 255;
    return QRMath.EXP_TABLE[n];
  },
  EXP_TABLE: new Array(256),
  LOG_TABLE: new Array(256)
};
for (let i = 0; i < 8; i++) QRMath.EXP_TABLE[i] = 1 << i;
for (let i = 8; i < 256; i++) QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4] ^ QRMath.EXP_TABLE[i - 5] ^ QRMath.EXP_TABLE[i - 6] ^ QRMath.EXP_TABLE[i - 8];
for (let i = 0; i < 255; i++) QRMath.LOG_TABLE[QRMath.EXP_TABLE[i]] = i;

export const generateQRCodeMatrix = (text: string): boolean[][] => {
  // Select QR Version based on text length (Byte Mode, EC Level M)
  const byteCount = new TextEncoder().encode(text).length;
  let typeNumber = 1;
  const capacityM = [0, 14, 26, 42, 62, 84, 106, 122, 152];
  while (typeNumber < 8 && byteCount > capacityM[typeNumber]) {
    typeNumber++;
  }
  const moduleCount = typeNumber * 4 + 17;
  const matrix: (boolean | null)[][] = Array.from({ length: moduleCount }, () => Array(moduleCount).fill(null));

  // Position detection patterns
  const addFinderPattern = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      if (row + r <= -1 || moduleCount <= row + r) continue;
      for (let c = -1; c <= 7; c++) {
        if (col + c <= -1 || moduleCount <= col + c) continue;
        if ((0 <= r && r <= 6 && (c === 0 || c === 6)) ||
            (0 <= c && c <= 6 && (r === 0 || r === 6)) ||
            (2 <= r && r <= 4 && 2 <= c && c <= 4)) {
          matrix[row + r][col + c] = true;
        } else {
          matrix[row + r][col + c] = false;
        }
      }
    }
  };

  addFinderPattern(0, 0);
  addFinderPattern(moduleCount - 7, 0);
  addFinderPattern(0, moduleCount - 7);

  // Timing patterns
  for (let r = 8; r < moduleCount - 8; r++) {
    if (matrix[r][6] === null) matrix[r][6] = (r % 2 === 0);
  }
  for (let c = 8; c < moduleCount - 8; c++) {
    if (matrix[6][c] === null) matrix[6][c] = (c % 2 === 0);
  }

  // Dark module
  matrix[4 * typeNumber + 9][8] = true;

  // Alignment Pattern for version >= 2
  if (typeNumber >= 2) {
    const pos = [6, typeNumber * 4 + 10];
    for (let i = 0; i < pos.length; i++) {
      for (let j = 0; j < pos.length; j++) {
        const row = pos[i];
        const col = pos[j];
        if (matrix[row][col] !== null) continue;
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            matrix[row + r][col + c] = (Math.max(Math.abs(r), Math.abs(c)) !== 1);
          }
        }
      }
    }
  }

  // Data encode
  const buffer = new QRBitBuffer();
  buffer.put(4, 4); // Byte mode (0100)
  buffer.put(byteCount, typeNumber < 10 ? 8 : 16);
  const bytes = new TextEncoder().encode(text);
  for (let i = 0; i < bytes.length; i++) buffer.put(bytes[i], 8);

  const totalDataCount = [0, 16, 28, 44, 64, 86, 108, 124, 154][typeNumber];
  while (buffer.length + 4 <= totalDataCount * 8) buffer.put(0, 4);
  if (buffer.length % 8 !== 0) buffer.put(0, 8 - (buffer.length % 8));
  while (buffer.length < totalDataCount * 8) {
    buffer.put(0xec, 8);
    if (buffer.length < totalDataCount * 8) buffer.put(0x11, 8);
  }

  // Error correction
  const ecCount = [0, 10, 16, 26, 18, 24, 16, 18, 22][typeNumber];
  const rsPoly = (function(ecCount) {
    let p = new Polynomial([1]);
    for (let i = 0; i < ecCount; i++) {
      p = p.multiply(new Polynomial([1, QRMath.gexp(i)]));
    }
    return p;
  })(ecCount);

  const rawPoly = new Polynomial(buffer.buffer, ecCount);
  const modPoly = rawPoly.mod(rsPoly);
  const ecData: number[] = new Array(rsPoly.getLength() - 1);
  for (let i = 0; i < ecData.length; i++) {
    const modIndex = i + modPoly.getLength() - ecData.length;
    ecData[i] = (modIndex >= 0) ? modPoly.get(modIndex) : 0;
  }

  const finalData = buffer.buffer.concat(ecData);

  // Mask & place data
  let bitIndex = 0;
  for (let col = moduleCount - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let count = 0; count < moduleCount; count++) {
      for (let c = 0; c < 2; c++) {
        const cCol = col - c;
        const cRow = ((col + 1) & 2) === 0 ? moduleCount - 1 - count : count;
        if (matrix[cRow][cCol] === null) {
          let dark = false;
          if (bitIndex < finalData.length * 8) {
            dark = ((finalData[Math.floor(bitIndex / 8)] >>> (7 - (bitIndex % 8))) & 1) === 1;
            bitIndex++;
          }
          // Pattern mask condition (mask 0: (row + col) % 2 == 0)
          const mask = (cRow + cCol) % 2 === 0;
          matrix[cRow][cCol] = dark !== mask;
        }
      }
    }
  }

  // Format info
  const formatInfo = 0x5412; // Mask 0, EC Level M
  for (let i = 0; i < 15; i++) {
    const mod = ((formatInfo >>> i) & 1) === 1;
    if (i < 6) matrix[i][8] = mod;
    else if (i < 8) matrix[i + 1][8] = mod;
    else matrix[moduleCount - 15 + i][8] = mod;

    if (i < 8) matrix[8][moduleCount - i - 1] = mod;
    else if (i < 9) matrix[8][15 - i - 1 + 1] = mod;
    else matrix[8][15 - i - 1] = mod;
  }

  return matrix.map(row => row.map(cell => cell === true));
};

export const generateQRCodeSVG = (text: string, size = 150): string => {
  if (!text) return '';
  const matrix = generateQRCodeMatrix(text);
  const count = matrix.length;
  const cellSize = size / (count + 4); // Include 2 modules quiet zone
  const quietZone = 2 * cellSize;

  let rects = '';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (matrix[r][c]) {
        const x = quietZone + c * cellSize;
        const y = quietZone + r * cellSize;
        rects += `<rect x="${x}" y="${y}" width="${cellSize + 0.5}" height="${cellSize + 0.5}" fill="#000000" />`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <rect width="100%" height="100%" fill="#ffffff" />
    ${rects}
  </svg>`;
};

// --- PRINT FUNCTIONS ---
export const printBarcode = (productCode: string, productName: string) => {
  const svg = generateBarcodeSVG(productCode, 70, 2);
  const printWindow = window.open('', '_blank', 'width=500,height=400');
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Stampa Barcode - ${productCode}</title>
        <style>
          @page { margin: 0; size: auto; }
          body {
            margin: 0;
            padding: 15px;
            font-family: Arial, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: #fff;
          }
          .label-container {
            border: 1px dashed #ccc;
            padding: 15px 25px;
            text-align: center;
            border-radius: 8px;
            display: inline-block;
          }
          .title {
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 8px;
            color: #111;
            max-width: 320px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
        </style>
      </head>
      <body>
        <div class="label-container">
          <div class="title">${productName || 'Articolo'}</div>
          <div>${svg}</div>
        </div>
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
};

export const printQRCode = (productCode: string, productName: string) => {
  const svg = generateQRCodeSVG(productCode, 180);
  const printWindow = window.open('', '_blank', 'width=500,height=400');
  if (!printWindow) return;

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Stampa QR Code - ${productCode}</title>
        <style>
          @page { margin: 0; size: auto; }
          body {
            margin: 0;
            padding: 15px;
            font-family: Arial, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: #fff;
          }
          .label-container {
            border: 1px dashed #ccc;
            padding: 15px 25px;
            text-align: center;
            border-radius: 8px;
            display: inline-block;
          }
          .title {
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 10px;
            color: #111;
            max-width: 250px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .code-label {
            font-size: 15px;
            font-weight: bold;
            font-family: monospace;
            margin-top: 8px;
            color: #222;
          }
        </style>
      </head>
      <body>
        <div class="label-container">
          <div class="title">${productName || 'Articolo'}</div>
          <div>${svg}</div>
          <div class="code-label">${productCode}</div>
        </div>
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
};
