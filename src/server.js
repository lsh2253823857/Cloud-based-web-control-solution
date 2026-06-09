/**
 * RPA 云端 API 服务
 * 提供文件上传、任务提交、日志推送、cookies 管理等功能
 */
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { addTask, getTaskStatus, getQueueStats } = require('./lib/queue');
const { initTask, addLog, getTaskLogs, getTaskProgress } = require('./lib/task-store');
const { saveCookies, loadCookies, COOKIES_FILE } = require('./lib/browser');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// 文件上传配置
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    // 使用时间戳 + 原始文件名，避免冲突
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `${basename}-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls') {
      cb(null, true);
    } else {
      cb(new Error('只支持 .xlsx 和 .xls 格式的文件'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// ==================== API 路由 ====================

/**
 * 上传 Excel 文件
 * POST /api/upload
 * FormData: goods (File), report (File)
 */
app.post('/api/upload', upload.fields([
  { name: 'goods', maxCount: 1 },
  { name: 'report', maxCount: 1 }
]), (req, res) => {
  try {
    const goodsFile = req.files?.goods?.[0];
    const reportFile = req.files?.report?.[0];

    if (!goodsFile || !reportFile) {
      return res.status(400).json({ error: '请上传商品数据和直通车数据两个文件' });
    }

    res.json({
      success: true,
      goodsFile: goodsFile.filename,
      reportFile: reportFile.filename,
      message: '文件上传成功'
    });
  } catch (err) {
    res.status(500).json({ error: `上传失败: ${err.message}` });
  }
});

/**
 * 提交 RPA 任务
 * POST /api/tasks
 * Body: { scriptType: 'batch_pause_promotion' | 'batch_delist_goods', goodsFile, reportFile }
 */
app.post('/api/tasks', async (req, res) => {
  try {
    const { scriptType, goodsFile, reportFile } = req.body;

    if (!scriptType || !goodsFile || !reportFile) {
      return res.status(400).json({ error: '缺少必要参数: scriptType, goodsFile, reportFile' });
    }

    const validTypes = ['batch_pause_promotion', 'batch_delist_goods'];
    if (!validTypes.includes(scriptType)) {
      return res.status(400).json({ error: `无效的脚本类型，可选: ${validTypes.join(', ')}` });
    }

    const { taskId } = await addTask(scriptType, {
      scriptType,
      goodsFile,
      reportFile
    });

    // 初始化日志和进度
    initTask(taskId);

    res.json({ success: true, taskId, message: '任务已提交' });
  } catch (err) {
    res.status(500).json({ error: `任务提交失败: ${err.message}` });
  }
});

/**
 * SSE 实时日志推送
 * GET /api/tasks/:taskId/logs
 */
app.get('/api/tasks/:taskId/logs', (req, res) => {
  const { taskId } = req.params;

  // 设置 SSE 头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let lastLogIndex = 0;

  // 发送已有日志
  const existingLogs = getTaskLogs(taskId);
  for (const log of existingLogs) {
    res.write(`data: ${JSON.stringify({ type: 'log', message: log })}\n\n`);
  }
  lastLogIndex = existingLogs.length;

  // 发送当前进度
  const currentProgress = getTaskProgress(taskId);
  res.write(`data: ${JSON.stringify({ type: 'progress', progress: currentProgress })}\n\n`);

  // 定时检查新日志
  const interval = setInterval(async () => {
    try {
      const logs = getTaskLogs(taskId);
      const currentProgressVal = getTaskProgress(taskId);

      // 发送新日志
      while (lastLogIndex < logs.length) {
        res.write(`data: ${JSON.stringify({ type: 'log', message: logs[lastLogIndex] })}\n\n`);
        lastLogIndex++;
      }

      // 发送进度
      res.write(`data: ${JSON.stringify({ type: 'progress', progress: currentProgressVal })}\n\n`);

      // 检查任务是否完成
      const status = await getTaskStatus(taskId);
      if (status && (status.state === 'completed' || status.state === 'failed')) {
        // 发送剩余日志
        while (lastLogIndex < logs.length) {
          res.write(`data: ${JSON.stringify({ type: 'log', message: logs[lastLogIndex] })}\n\n`);
          lastLogIndex++;
        }

        if (status.state === 'completed') {
          res.write(`data: ${JSON.stringify({ type: 'done', message: '任务执行完成', result: status.result })}\n\n`);
        } else {
          res.write(`data: ${JSON.stringify({ type: 'error', message: `任务失败: ${status.failedReason}` })}\n\n`);
        }

        clearInterval(interval);
        res.end();
      }
    } catch (err) {
      console.error(`[SSE] 错误: ${err.message}`);
    }
  }, 500);

  // 客户端断开连接
  req.on('close', () => {
    clearInterval(interval);
  });
});

/**
 * 查询任务状态
 * GET /api/tasks/:taskId
 */
app.get('/api/tasks/:taskId', async (req, res) => {
  try {
    const status = await getTaskStatus(req.params.taskId);
    if (!status) {
      return res.status(404).json({ error: '任务不存在' });
    }

    res.json({
      ...status,
      logs: getTaskLogs(req.params.taskId),
      progress: getTaskProgress(req.params.taskId)
    });
  } catch (err) {
    res.status(500).json({ error: `查询失败: ${err.message}` });
  }
});

/**
 * 查询队列统计
 * GET /api/queue/stats
 */
app.get('/api/queue/stats', async (req, res) => {
  try {
    const stats = await getQueueStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: `查询失败: ${err.message}` });
  }
});

/**
 * 导入 cookies
 * POST /api/cookies/import
 * Body: { cookies: [...] }
 */
app.post('/api/cookies/import', (req, res) => {
  try {
    const { cookies } = req.body;

    if (!cookies || !Array.isArray(cookies)) {
      return res.status(400).json({ error: '请提供有效的 cookies 数组' });
    }

    saveCookies(cookies);
    res.json({ success: true, message: 'Cookies 导入成功' });
  } catch (err) {
    res.status(500).json({ error: `导入失败: ${err.message}` });
  }
});

/**
 * 查询 cookies 状态
 * GET /api/cookies/status
 */
app.get('/api/cookies/status', (req, res) => {
  const exists = fs.existsSync(COOKIES_FILE);
  let lastModified = null;

  if (exists) {
    const stats = fs.statSync(COOKIES_FILE);
    lastModified = stats.mtime.toISOString();
  }

  res.json({ exists, lastModified });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('[Server] 错误:', err.message);
  res.status(500).json({ error: err.message });
});

// 启动服务
app.listen(PORT, () => {
  console.log(`[Server] RPA 云端服务已启动: http://localhost:${PORT}`);
  console.log(`[Server] API 文档:`);
  console.log(`  POST /api/upload            - 上传 Excel 文件`);
  console.log(`  POST /api/tasks              - 提交 RPA 任务`);
  console.log(`  GET  /api/tasks/:id/logs     - SSE 实时日志`);
  console.log(`  GET  /api/tasks/:id          - 查询任务状态`);
  console.log(`  GET  /api/queue/stats        - 队列统计`);
  console.log(`  POST /api/cookies/import     - 导入 cookies`);
  console.log(`  GET  /api/cookies/status     - cookies 状态`);
});
