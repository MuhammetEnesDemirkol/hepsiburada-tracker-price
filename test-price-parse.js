const assert = require('assert');

// Buraya multi-scraper.js'deki parsePrice fonksiyonunu kopyala:
function parsePrice(priceString) {
  if (typeof priceString === 'number') {
    return priceString;
  }
  if (!priceString || typeof priceString !== 'string') {
    return null;
  }
  let cleanPrice = priceString.trim();
  cleanPrice = cleanPrice.replace(/\s+/g, '');
  cleanPrice = cleanPrice.replace(/[₺$€£]/g, '');
  cleanPrice = cleanPrice.replace(/TL/gi, '');
  cleanPrice = cleanPrice.replace(/TRY/gi, '');
  cleanPrice = cleanPrice.replace(/[^\d.,]/g, '');
  if (!/\d/.test(cleanPrice)) {
    return null;
  }
  let numericPrice = null;
  // Türk fiyat formatı: hem nokta hem virgül varsa
  if (cleanPrice.includes('.') && cleanPrice.includes(',')) {
    // "12.345,67" → 12345.67
    cleanPrice = cleanPrice.replace(/\./g, '');
    cleanPrice = cleanPrice.replace(',', '.');
    numericPrice = parseFloat(cleanPrice);
  } else if (cleanPrice.includes(',') && !cleanPrice.includes('.')) {
    // "1234,56" → 1234.56
    numericPrice = parseFloat(cleanPrice.replace(',', '.'));
  } else if (cleanPrice.includes('.') && !cleanPrice.includes(',')) {
    // Sadece bir nokta varsa ve 3 basamaklıysa binliktir: "12.345" → 12345
    // "1234.56" gibi ondalık da olabilir, kontrol et
    const parts = cleanPrice.split('.');
    if (parts.length === 2 && parts[1].length === 3) {
      // "12.345" gibi: binlik
      numericPrice = parseFloat(parts[0] + parts[1]);
    } else if (parts.length === 2 && parts[1].length <= 2) {
      // "1234.56" gibi: ondalık
      numericPrice = parseFloat(cleanPrice);
    } else {
      // "1.234.567" gibi: tüm noktaları kaldır
      numericPrice = parseFloat(cleanPrice.replace(/\./g, ''));
    }
  } else {
    // Sadece rakamlar: "1234"
    numericPrice = parseFloat(cleanPrice);
  }
  if (isNaN(numericPrice) || numericPrice <= 0) {
    return null;
  }
  if (numericPrice < 1 || numericPrice > 1000000) {
    return null;
  }
  return numericPrice;
}

// Testler
const tests = [
  // [input, expected]
  ["1.234,56 TL", 1234.56],
  ["12.345 TL", 12345],
  ["1,50 TL", 1.5],
  ["1234,56", 1234.56],
  ["1234.56", 1234.56],
  ["₺1.234,56", 1234.56],
  ["1.234,56₺", 1234.56],
  ["1234", 1234],
  ["24.900", 24900],
  ["24.900 TL", 24900],
  ["Ücretsiz", null],
  ["Fiyat belirtilmemiş", null],
  ["0", null],
  ["9999999", null],
  [24900, 24900], // sayı olarak
];

console.log("parsePrice testleri:");
for (const [input, expected] of tests) {
  const result = parsePrice(input);
  assert.strictEqual(result, expected, `parsePrice(\"${input}\") = ${result}, beklenen: ${expected}`);
  console.log(`  ✓ \"${input}\" → ${result}`);
}

// Karşılaştırma testi
function fiyatKarsilastir(oldVal, newVal) {
  const oldPrice = parsePrice(oldVal);
  const newPrice = parsePrice(newVal);
  if (oldPrice === null || newPrice === null) return "Geçersiz";
  if (oldPrice === newPrice) return "Aynı";
  if (newPrice < oldPrice) return "Düştü";
  if (newPrice > oldPrice) return "Arttı";
}

console.log("\nKarşılaştırma testleri:");
assert.strictEqual(fiyatKarsilastir("24.900", "24.900"), "Aynı");
assert.strictEqual(fiyatKarsilastir("24.900", "23.900"), "Düştü");
assert.strictEqual(fiyatKarsilastir("24.900", "25.900"), "Arttı");
assert.strictEqual(fiyatKarsilastir("Ücretsiz", "24.900"), "Geçersiz");
console.log("  ✓ Karşılaştırma mantığı doğru çalışıyor.");

console.log("\nTüm testler BAŞARILI!"); 