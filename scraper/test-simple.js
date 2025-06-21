const puppeteer = require('puppeteer');

async function testHepsiburada() {
    let browser;
    try {
        console.log('🔍 Hepsiburada test baslatiliyor...');
        
        browser = await puppeteer.launch({
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        const testUrl = 'https://www.hepsiburada.com/iphone-ios-telefonlar-c-60005202';
        console.log(`🌐 Sayfa yukleniyor: ${testUrl}`);
        
        await page.goto(testUrl, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        await page.waitForTimeout(5000);

        await page.screenshot({ path: 'test-screenshot.png', fullPage: true });
        console.log('📸 Screenshot alindi: test-screenshot.png');

        const selectors = [
            'li[class*="productListContent"]',
            '[data-test-id="product-card"]',
            '.productListContent',
            'li[class^="productListContent-"]',
            '.product-card',
            '[class*="product"]'
        ];

        for (const selector of selectors) {
            try {
                const count = await page.$$eval(selector, elements => elements.length);
                console.log(`🔍 Selector "${selector}": ${count} element bulundu`);
                
                if (count > 0) {
                    const firstElement = await page.$eval(selector, el => {
                        return {
                            tagName: el.tagName,
                            className: el.className,
                            innerHTML: el.innerHTML.substring(0, 200) + '...'
                        };
                    });
                    console.log(`   Ilk element: ${JSON.stringify(firstElement, null, 2)}`);
                }
            } catch (error) {
                console.log(`❌ Selector "${selector}" hatasi: ${error.message}`);
            }
        }

        const pageContent = await page.content();
        console.log(`📄 Sayfa boyutu: ${pageContent.length} karakter`);
        
        const totalText = await page.evaluate(() => {
            const elements = document.querySelectorAll('*');
            for (const el of elements) {
                const text = el.textContent;
                if (text && text.includes('urun') && /\d+/.test(text)) {
                    return text.trim();
                }
            }
            return null;
        });
        
        console.log(`📊 Bulunan urun bilgisi: ${totalText}`);

    } catch (error) {
        console.error('❌ Test hatasi:', error.message);
    } finally {
        if (browser) {
            await browser.close();
            console.log('🔒 Tarayici kapatildi');
        }
    }
}

testHepsiburada(); 