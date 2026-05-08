const puppeteer = require('puppeteer');
const jwt = require('jsonwebtoken');
require('dotenv').config();

(async () => {
    try {
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        
        const payload = { id: 'admin', role: 'admin', name: 'Admin Thắng Tin Học', adminRole: 'SUPER_ADMIN', permissions: [], branchId: null, branchCode: '' };
        const token = jwt.sign({...payload, aud: 'internal'}, process.env.JWT_SECRET, { expiresIn: '8h' });
        
        await page.goto('http://localhost:5173');
        await page.evaluate(({ token, payload }) => {
            localStorage.setItem('admin_user', JSON.stringify({
                ...payload, accessToken: token, refreshToken: token
            }));
            localStorage.setItem('admin_access_token', token);
        }, { token, payload });
        
        await page.goto('http://localhost:5173/dashboard#teachers', { waitUntil: 'networkidle0' });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'artifacts/teacher_tab_initial.png' });

        // Evaluate to change branch dropdown
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('chi nhánh') || el.textContent.includes('CƠ SỞ'));
            if (btn) btn.click();
        });
        await page.waitForTimeout(500);
        
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('CƠ SỞ 1'));
            if (btn) btn.click();
        });
        await page.waitForTimeout(2000);

        await page.screenshot({ path: 'artifacts/teacher_tab_cs1.png' });

        await page.goto('http://localhost:5173/dashboard#hr', { waitUntil: 'networkidle0' });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'artifacts/hr_tab_cs1.png' });

        await page.goto('http://localhost:5173/dashboard#analytics', { waitUntil: 'networkidle0' });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'artifacts/analytics_tab_cs1.png' });

        console.log('Screenshots taken.');
        await browser.close();
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
})();
