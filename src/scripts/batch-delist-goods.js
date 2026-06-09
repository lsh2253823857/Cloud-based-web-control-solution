/**
 * 批量下架商品脚本
 * 从 Excel 数据中读取商品ID，批量下架商品
 */
const { launchBrowser, loadCookies, importCookies, closeBrowser } = require('../lib/browser');
const { parseGoodsIds, parsePromotionData, filterForDelist, splitBatches } = require('../lib/excel-parser');

const BATCH_SIZE = 10;
const TARGET_URL = 'https://mms.pinduoduo.com/goods/goods_list?msfrom=mms_sidenav';

/**
 * 执行批量下架商品任务
 * @param {Object} params
 * @param {string} params.goodsFile - 商品数据文件路径
 * @param {string} params.reportFile - 直通车数据文件路径
 * @param {Function} params.log - 日志回调函数
 * @param {Function} params.progress - 进度回调函数
 */
async function execute({ goodsFile, reportFile, log, progress }) {
  let context = null;

  try {
    log('=========================================');
    log('拼多多批量下架商品');
    log('=========================================');
    log(`商品数据: ${goodsFile}`);
    log(`直通车数据: ${reportFile}`);
    log(`批次大小: ${BATCH_SIZE}`);
    log('=========================================');

    // 1. 解析 Excel 数据
    log('正在解析 Excel 数据...');
    const goodsIds = parseGoodsIds(goodsFile);
    const promotionDict = parsePromotionData(reportFile);
    const filteredIds = filterForDelist(goodsIds, promotionDict);

    if (filteredIds.length === 0) {
      log('没有找到需要下架的商品。');
      return { success: true, total: 0, processed: 0, skipped: 0 };
    }

    log(`共找到 ${filteredIds.length} 个需要下架的商品。`);
    progress(5);

    // 2. 分批处理
    const batches = splitBatches(filteredIds, BATCH_SIZE);
    log(`共 ${batches.length} 个批次，开始执行...`);

    // 3. 启动浏览器
    log('启动浏览器...');
    context = await launchBrowser();
    const page = await context.newPage();

    // 4. 导入 cookies（如果有）
    const cookies = loadCookies();
    if (cookies) {
      log('导入登录 cookies...');
      await importCookies(context, cookies);
    }

    // 5. 导航到目标页面
    log('打开商品管理页面...');
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // 检查是否需要登录
    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('passport')) {
      log('[错误] 需要登录！请先通过 /api/cookies/import 接口导入 cookies');
      return { success: false, error: '需要登录', total: filteredIds.length, processed: 0 };
    }

    // 6. 逐批执行
    let processed = 0;
    let skipped = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchNum = i + 1;

      log('-----------------------------------------');
      log(`批次 ${batchNum}: ${batch.length} 个商品`);
      log('-----------------------------------------');

      const idsStr = batch.join(',');

      try {
        // 搜索商品
        const input = page.getByTestId('beast-core-input-htmlInput').first();
        await input.click();
        await input.fill(idsStr);
        await input.press('Enter');
        await page.waitForTimeout(3000);

        // 检查是否有搜索结果
        const rows = await page.locator('table tbody tr, .anq-table-row').count();
        if (rows === 0) {
          log('本批次没有找到可下架的商品，跳过');
          skipped++;
          continue;
        }

        // 全选
        await page.locator('[class*=CBX_square]').first().click();
        await page.waitForTimeout(500);

        // 批量下架
        await page.locator('button:has-text("批量下架")').click();
        await page.waitForTimeout(1000);

        // 确认下架
        await page.locator('button:has-text("确认下架"), button:has-text("确认"), button:has-text("确定")').click();
        await page.waitForTimeout(3000);

        processed++;
        log(`批次 ${batchNum} 完成！`);
      } catch (err) {
        log(`批次 ${batchNum} 执行出错: ${err.message}`);
      }

      // 更新进度
      const progressPercent = Math.round(5 + (batchNum / batches.length) * 90);
      progress(progressPercent);
    }

    // 7. 保存 cookies
    const newCookies = await context.cookies();
    const { saveCookies } = require('../lib/browser');
    saveCookies(newCookies);
    log('已保存登录 cookies');

    progress(100);
    log('=========================================');
    log('所有批次执行完毕！');
    log('=========================================');

    return {
      success: true,
      total: filteredIds.length,
      processed,
      skipped,
      batches: batches.length
    };

  } finally {
    await closeBrowser(context);
  }
}

module.exports = { execute };
