/**
 * BullMQ 任务队列配置
 * 使用 Redis 作为后端存储
 */
const { Queue, Worker } = require('bullmq');
const { v4: uuidv4 } = require('uuid');

// Redis 连接配置
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined
};

// 任务队列
const rpaQueue = new Queue('rpa-tasks', {
  connection: REDIS_CONFIG,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 100
  }
});

/**
 * 添加任务到队列
 */
async function addTask(taskType, data) {
  const taskId = uuidv4();
  const job = await rpaQueue.add(taskType, {
    taskId,
    ...data,
    createdAt: new Date().toISOString()
  }, {
    jobId: taskId
  });

  return { taskId, jobId: job.id };
}

/**
 * 获取任务状态
 */
async function getTaskStatus(taskId) {
  const job = await rpaQueue.getJob(taskId);
  if (!job) return null;

  const state = await job.getState();
  return {
    id: job.id,
    type: job.name,
    state,
    progress: job.progress,
    data: job.data,
    result: job.returnvalue,
    failedReason: job.failedReason,
    timestamp: job.timestamp
  };
}

/**
 * 获取队列统计信息
 */
async function getQueueStats() {
  const [waiting, active, completed, failed] = await Promise.all([
    rpaQueue.getWaitingCount(),
    rpaQueue.getActiveCount(),
    rpaQueue.getCompletedCount(),
    rpaQueue.getFailedCount()
  ]);

  return { waiting, active, completed, failed };
}

module.exports = {
  rpaQueue,
  addTask,
  getTaskStatus,
  getQueueStats,
  REDIS_CONFIG
};
