const { chromium } = require('playwright');
const jwt = require('jsonwebtoken');
require('dotenv').config();

(async () => {
    try {
        const browser = await chromium.launch();
        const context = await browser.newContext();
        const page = await context.newPage();
        
        const payload = { id: 'admin', role: 'admin', name: 'Admin Thắng Tin Học', adminRole: 'SUPER_ADMIN', permissions: [], branchId: null, branchCode: '' };
        const token = jwt.sign({...payload, aud: 'internal'}, process.env.JWT_SECRET, { expiresIn: '8h' });
        
        await page.goto('http://localhost:5173');
        await page.evaluate(({ token, payload }) => {
            localStorage.setItem('admin_user', JSON.stringify({
                ...payload, accessToken: token, refreshToken: token
            }));
            localStorage.setItem('admin_access_token', token);
        }, { token, payload });
        
        await page.goto('http://localhost:5173/dashboard#teachers');
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'artifacts/teacher_tab_initial.png' });

        // Evaluate in DOM to select branch directly or click dropdown 
        const selectors = [
            'button:has-text("Tất cả chi nhánh")',
            'button:has-text("CƠ SỞ 1")',
            'button:has-text("CƠ SỞ 2")'
        ];
        for (const sel of selectors) {
            const btns = await page.$$(sel);
            if (btns.length > 0) {
                await btns[0].click();
                await page.waitForTimeout(500);
                
                const cs1Btns = await page.$$('button:text-is("🏢 CƠ SỞ 1")'); // Look for the dropdown list item
                if (cs1Btns.length > 0) {
                    await cs1Btns[0].click();
                    break;
                }
            }
        }
        await page.waitForTimeout(2000);

        await page.screenshot({ path: 'artifacts/teacher_tab_cs1.png' });

        await page.goto('http://localhost:5173/dashboard#hr');
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'artifacts/hr_tab_cs1.png' });

        await page.goto('http://localhost:5173/dashboard#analytics');
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'artifacts/analytics_tab_cs1.png' });

        console.log('Screenshots taken in artifacts directory.');
        await browser.close();
    } catch(e) {
        console.error(e);
    }
})();
