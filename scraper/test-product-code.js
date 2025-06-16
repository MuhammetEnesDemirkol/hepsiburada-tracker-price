const testLinks = [
  'https://www.hepsiburada.com/chicco-myseat-i-size-oto-koltugu-9-36-kg-p-HBCV00003MNS1T',
  'https://www.hepsiburada.com/htun-simulasyon-1-32-tarim-traktor-alasimli-model-dokum-surgulu-muhendislik-araba-oyuncak-nefis-cocuk-hediyesi-diecasts-amp-oyuncak-arac-yurt-disindan-pm-HBC00005GSMAG',
  'https://www.hepsiburada.com/ky-2011a-1-14-rc-paletli-uzaktan-kumandali-off-road-oyuncak-araba-kirmizi-yurt-disindan-pm-HBC000000B89C',
  'https://www.hepsiburada.com/urun-p-HBCV00006NVTB0',
  'https://www.hepsiburada.com/urunler/HBC00005GSK9G',
  'https://www.hepsiburada.com/dolu-8086-sahara-uzaktan-kumanli-akulu-araba-12-v-beyaz-pm-HB00000PGW68',
  'https://www.hepsiburada.com/babyhope-436-uzaktan-kumandali-akulu-araba-12v-beyaz-p-HBV00000PEAYO',
  'https://www.hepsiburada.com/pilsan-tery-bery-12v-akulu-araba-pm-ailepil05261',
  'https://www.hepsiburada.com/urunler/HB00000LKII7',
];

function extractProductCode(link) {
  // En yaygın Hepsiburada kodlarını yakala (HBC, HBV, HB, ailepil, vs.)
  const match = link.match(/-(HBC|HBV|HB)[A-Z0-9]+|-(ailepil[0-9]+)/i);
  if (match) {
    return match[0].replace('-', '');
  }
  // Son fallback: linkin sonunda 8+ karakterli büyük harf/rakam varsa onu al
  const fallback = link.match(/-([A-Z0-9]{8,})$/i);
  return fallback ? fallback[1] : null;
}

testLinks.forEach(link => {
  const code = extractProductCode(link);
  console.log(`Link: ${link}`);
  console.log(`Kod: ${code}`);
  console.log('---');
}); 