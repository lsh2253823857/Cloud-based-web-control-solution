/**
 * 任务状态存储模块
 * 在内存中存储任务日志和进度，供 API 和 Worker 共享
 */

// 任务日志: taskId -> string[]
const taskLogs = new Map();

// 任务进度: taskId -> number
const taskProgress = new Map();

/**
 * 初始化任务
 */
function initTask(taskId) {
  taskLogs.set(taskId, [`任务已提交，等待执行...`]);
  taskProgress.set(taskId, 0);
}

/**
 * 添加日志
 */
function addLog(taskId, message) {
  const logs = taskLogs.get(taskId);
  if (logs) {
    logs.push(message);
  } else {
    taskLogs.set(taskId, [message]);
  }
}

/**
 * 获取任务日志
 */
function getTaskLogs(taskId) {
  return taskLogs.get(taskId) || [];
}

/**
 * 更新进度
 */
function updateProgress(taskId, percent) {
  taskProgress.set(taskId, percent);
}

/**
 * 获取任务进度
 */
function getTaskProgress(taskId) {
  return taskProgress.get(taskId) || 0;
}

module.exports = {
  taskLogs,
  taskProgress,
  initTask,
  addLog,
  getTaskLogs,
  updateProgress,
  getTaskProgress
};
