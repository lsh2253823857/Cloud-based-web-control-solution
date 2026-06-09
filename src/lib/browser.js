/**
 * 浏览器管理模块
 * 处理 Playwright 浏览器实例的创建、cookies 管理和登录态维护
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BROWSER_DATA_DIR = path.join(__dirname, '../../browser-data');
const COOKIES_FILE = path.join(BROWSER_DATA_DIR, 'cookies.json');

/**
 * 启动浏览器（云端无头模式）
 * 使用持久化上下文保持登录态
 */
async function launchBrowser() {
  // 确保目录存在
  if (!fs.existsSync(BROWSER_DATA_DIR)) {
    fs.mkdirSync(BROWSER_DATA_DIR, { recursive: true });
  }

  const context = await chromium.launchPersistentContext(BROWSER_DATA_DIR, {
    headless: true,
    viewport: { width: 1920, height: 1080 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });

  return context;
}

/**
 * 从文件加载 cookies
 */
function loadCookies() {
  if (fs.existsSync(COOKIES_FILE)) {
    return JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
  }
  return null;
}

/**
 * 保存 cookies 到文件
 */
function saveCookies(cookies) {
  if (!fs.existsSync(BROWSER_DATA_DIR)) {
    fs.mkdirSync(BROWSER_DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
}

/**
 * 导入 cookies 到浏览器上下文
 */
async function importCookies(context, cookies) {
  if (cookies && cookies.length > 0) {
    // 格式化 cookies 以符合 Playwright 要求
    const formattedCookies = cookies.map(cookie => {
      // 处理 sameSite: "unspecified" -> "None"
      let sameSite = cookie.sameSite;
      if (!sameSite || sameSite === 'unspecified' || sameSite === 'no_restriction') {
        sameSite = 'None';
      }
      // 确保首字母大写
      sameSite = sameSite.charAt(0).toUpperCase() + sameSite.slice(1).toLowerCase();

      return {
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || '/',
        expires: cookie.expirationDate || cookie.expires || -1,
        httpOnly: cookie.httpOnly || false,
        secure: cookie.secure || false,
        sameSite: sameSite
      };
    });

    await context.addCookies(formattedCookies);
  }
}

/**
 * 检查是否已登录（通过检测页面元素）
 */
async function isLoggedIn(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);

    // 检查是否跳转到登录页
    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('passport')) {
      return false;
    }

    // 检查是否有登录态标记元素
    const hasLoginElement = await page.locator('[class*="user"], [class*="avatar"], [class*="account"]').count();
    return hasLoginElement > 0;
  } catch {
    return false;
  }
}

/**
 * 关闭浏览器上下文
 */
async function closeBrowser(context) {
  if (context) {
    try {
      await context.close();
    } catch {}
  }
}

module.exports = {
  launchBrowser,
  loadCookies,
  saveCookies,
  importCookies,
  isLoggedIn,
  closeBrowser,
  BROWSER_DATA_DIR,
  COOKIES_FILE
};
