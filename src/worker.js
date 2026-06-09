/**
 * BullMQ Worker
 * 从队列中拉取任务并执行对应的 RPA 脚本
 */
const { Worker } = require('bullmq');
const { REDIS_CONFIG } = require('./lib/queue');
const { addLog, updateProgress } = require('./lib/task-store');
const batchPausePromotion = require('./scripts/batch-pause-promotion');
const batchDelistGoods = require('./scripts/batch-delist-goods');
const path = require('path');
const fs = require('fs');

// 脚本映射
const SCRIPT_MAP = {
  'batch_pause_promotion': batchPausePromotion,
  'batch_delist_goods': batchDelistGoods
};

/**
 * 创建 Worker
 */
function createWorker() {
  const worker = new Worker('rpa-tasks', async (job) => {
    const { taskId, scriptType, goodsFile, reportFile } = job.data;

    console.log(`[Worker] 开始执行任务: ${taskId}, 类型: ${scriptType}`);

    const script = SCRIPT_MAP[scriptType];
    if (!script) {
      const error = `未知的脚本类型: ${scriptType}`;
      console.error(`[Worker] ${error}`);
      addLog(taskId, `[错误] ${error}`);
      throw new Error(error);
    }

    // 检查文件是否存在
    const uploadsDir = path.join(__dirname, '../uploads');
    const goodsPath = path.join(uploadsDir, goodsFile);
    const reportPath = path.join(uploadsDir, reportFile);

    if (!fs.existsSync(goodsPath)) {
      const error = `商品数据文件不存在: ${goodsFile}`;
      addLog(taskId, `[错误] ${error}`);
      throw new Error(error);
    }
    if (!fs.existsSync(reportPath)) {
      const error = `直通车数据文件不存在: ${reportFile}`;
      addLog(taskId, `[错误] ${error}`);
      throw new Error(error);
    }

    // 日志回调
    const log = (message) => {
      console.log(`[Task ${taskId}] ${message}`);
      addLog(taskId, message);
    };

    // 进度回调
    const progress = (percent) => {
      updateProgress(taskId, percent);
      job.updateProgress(percent);
    };

    try {
      const result = await script.execute({
        goodsFile: goodsPath,
        reportFile: reportPath,
        log,
        progress
      });

      console.log(`[Worker] 任务完成: ${taskId}`, result);
      return result;
    } catch (err) {
      console.error(`[Worker] 任务失败: ${taskId}`, err.message);
      addLog(taskId, `[错误] 执行失败: ${err.message}`);
      throw err;
    }
  }, {
    connection: REDIS_CONFIG,
    concurrency: 1 // 同一时间只执行一个任务（因为浏览器资源有限）
  });

  worker.on('completed', (job) => {
    console.log(`[Worker] 任务完成: ${job.data.taskId}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] 任务失败: ${job?.data?.taskId}`, err.message);
  });

  return worker;
}

// 如果直接运行此文件，启动 Worker
if (require.main === module) {
  console.log('[Worker] 启动 RPA Worker...');
  console.log('[Worker] 等待任务...');
  createWorker();
}

module.exports = { createWorker };
