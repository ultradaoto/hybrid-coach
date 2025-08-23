const { chromium } = require('playwright');

async function findCloseButton() {
  console.log('🔍 Finding close button selectors...');
  
  const browser = await chromium.launch({ 
    headless: false,
    devtools: true
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  // Login to Skool
  console.log('🔑 Logging in...');
  await page.goto('https://www.skool.com/login');
  await page.waitForSelector('#email');
  await page.fill('#email', process.env.SKOOL_EMAIL);
  await page.fill('#password', process.env.SKOOL_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);
  
  // Go to profile
  await page.goto('https://www.skool.com/@my-ultra-coach-6588');
  await page.waitForTimeout(3000);
  
  // Click mail icon to open popup
  console.log('📧 Opening mail popup...');
  const mailButton = await page.$('.styled__ChatNotificationsIconButton-sc-14ipnak-0');
  if (mailButton) {
    await mailButton.click();
    await page.waitForTimeout(2000);
  }
  
  // Look for all potential close buttons
  console.log('🔍 Analyzing all potential close buttons...');
  
  const closeButtonAnalysis = await page.evaluate(() => {
    const potentialCloseButtons = [];
    
    // Look for buttons with X, close text, or close-like attributes
    const allButtons = Array.from(document.querySelectorAll('button, div[role="button"], [onclick]'));
    
    allButtons.forEach((btn, index) => {
      const text = btn.textContent?.trim();
      const ariaLabel = btn.getAttribute('aria-label');
      const className = btn.className;
      const innerHTML = btn.innerHTML;
      
      // Check if it looks like a close button
      const isCloseButton = 
        text === '×' || 
        text === 'X' ||
        text === 'Close' ||
        ariaLabel?.toLowerCase().includes('close') ||
        innerHTML.includes('×') ||
        innerHTML.includes('close') ||
        className.includes('close') ||
        className.includes('Close');
        
      if (isCloseButton) {
        const rect = btn.getBoundingClientRect();
        potentialCloseButtons.push({
          index,
          tagName: btn.tagName,
          className: btn.className,
          id: btn.id,
          text: text,
          ariaLabel: ariaLabel,
          innerHTML: btn.innerHTML.substring(0, 100),
          position: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          parent: btn.parentElement ? {
            tagName: btn.parentElement.tagName,
            className: btn.parentElement.className
          } : null,
          isVisible: rect.width > 0 && rect.height > 0
        });
      }
    });
    
    return potentialCloseButtons;
  });
  
  console.log('🎯 Found potential close buttons:');
  closeButtonAnalysis.forEach((btn, i) => {
    console.log(`\n${i + 1}. ${btn.tagName} - "${btn.text}"`);
    console.log(`   Class: ${btn.className}`);
    console.log(`   Position: x=${btn.position.x}, y=${btn.position.y}`);
    console.log(`   Size: ${btn.position.width}x${btn.position.height}`);
    console.log(`   Visible: ${btn.isVisible}`);
    console.log(`   HTML: ${btn.innerHTML}`);
  });
  
  console.log('\n🎯 INSTRUCTIONS:');
  console.log('1. Look at the chat popup that should be open');
  console.log('2. Find the close button (usually top-right corner)');
  console.log('3. Right-click it and inspect element');
  console.log('4. Copy the selector and paste it here');
  console.log('\nPress any key to continue...');
  
  await page.pause();
  
  await browser.close();
}

findCloseButton().catch(console.error);
