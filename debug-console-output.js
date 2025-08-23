const { chromium } = require('playwright');
const fs = require('fs').promises;

async function captureDetailedConsoleOutput() {
  console.log('🔍 Starting detailed console capture...');
  
  const browser = await chromium.launch({ 
    headless: false,
    devtools: true
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  // Capture all console messages
  const consoleMessages = [];
  page.on('console', msg => {
    const text = msg.text();
    console.log('📋 CONSOLE:', text);
    consoleMessages.push({
      type: msg.type(),
      text: text,
      timestamp: new Date().toISOString()
    });
  });
  
  // Login to Skool
  await page.goto('https://www.skool.com/login');
  await page.waitForSelector('#email');
  await page.fill('#email', process.env.SKOOL_EMAIL);
  await page.fill('#password', process.env.SKOOL_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);
  
  // Go to profile
  await page.goto('https://www.skool.com/@my-ultra-coach-6588');
  await page.waitForTimeout(3000);
  
  // Inject the enhanced analysis function
  await page.addInitScript(() => {
    window.analyzeElement = (element) => {
      return {
        tagName: element.tagName,
        className: element.className,
        id: element.id,
        textContent: element.textContent?.trim().substring(0, 50),
        position: element.getBoundingClientRect(),
        attributes: Array.from(element.attributes).map(attr => `${attr.name}="${attr.value}"`),
        parent: element.parentElement ? {
          tagName: element.parentElement.tagName,
          className: element.parentElement.className
        } : null
      };
    };
  });
  
  console.log('\n🎯 Ready! Right-click elements and run:');
  console.log('   element = $0; // Select element in DevTools');  
  console.log('   console.log(analyzeElement(element)); // Analyze it');
  console.log('\n📧 Find the MAIL ICON and analyze it!');
  console.log('💡 Press any key when done...');
  
  // Wait for user input
  await page.pause();
  
  // Save console output
  await fs.writeFile('console-output.json', JSON.stringify(consoleMessages, null, 2));
  console.log('💾 Console output saved to console-output.json');
  
  await browser.close();
}

captureDetailedConsoleOutput().catch(console.error);
