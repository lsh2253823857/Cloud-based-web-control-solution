/**
 * Excel 文件解析模块
 * 读取商品数据和直通车数据，筛选符合条件的商品ID
 */
const XLSX = require('xlsx');
const path = require('path');

/**
 * 读取 Excel 文件，返回行数据数组
 */
function readSheet(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1 });
}

/**
 * 解析商品数据，提取商品ID列表（A列，跳过标题行）
 */
function parseGoodsIds(filePath) {
  const rows = readSheet(filePath);
  const ids = [];
  for (let i = 1; i < rows.length; i++) {
    const val = rows[i]?.[0];
    if (val !== undefined && val !== null && val !== '') {
      ids.push(String(typeof val === 'number' ? Math.floor(val) : val).trim());
    }
  }
  return ids;
}

/**
 * 构建直通车数据字典: { 商品ID: [{ cjje, hfe }] }
 * B列=商品ID, G列=成交金额, H列=花费额
 */
function parsePromotionData(filePath) {
  const rows = readSheet(filePath);
  const dict = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 8) continue;
    const gid = String(typeof row[1] === 'number' ? Math.floor(row[1]) : row[1]).trim();
    const cjje = row[6]; // G列: 成交金额
    const hfe = row[7];  // H列: 花费额
    if (!dict[gid]) dict[gid] = [];
    dict[gid].push({ cjje, hfe });
  }
  return dict;
}

/**
 * 筛选需要暂停推广的商品
 * 条件: 有成交但没花费，或没成交
 */
function filterForPausePromotion(goodsIds, promotionDict) {
  const filtered = [];
  for (const gid of goodsIds) {
    const entries = promotionDict[gid];
    if (!entries) continue;

    let totalCjje = 0;
    let totalHfe = 0;
    let hasDash = false;

    for (const { cjje, hfe } of entries) {
      const cjjeStr = String(cjje).trim();
      const hfeStr = String(hfe).trim();

      if (cjjeStr === '-') {
        hasDash = true;
        continue;
      }
      try { totalCjje += parseFloat(cjjeStr) || 0; } catch {}
      try { totalHfe += parseFloat(hfeStr) || 0; } catch {}
    }

    if (totalCjje !== 0 && totalHfe === 0 && !hasDash) {
      filtered.push(gid);
    } else if (totalCjje === 0) {
      filtered.push(gid);
    }
  }
  return filtered;
}

/**
 * 筛选需要下架的商品（与暂停推广条件相同）
 */
function filterForDelist(goodsIds, promotionDict) {
  return filterForPausePromotion(goodsIds, promotionDict);
}

/**
 * 将数组分成指定大小的批次
 */
function splitBatches(ids, batchSize) {
  const batches = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    batches.push(ids.slice(i, i + batchSize));
  }
  return batches;
}

module.exports = {
  readSheet,
  parseGoodsIds,
  parsePromotionData,
  filterForPausePromotion,
  filterForDelist,
  splitBatches
};
