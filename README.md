# 拼多多 RPA 云端服务

基于 Node.js + Playwright + BullMQ 的云端 RPA 自动化服务。

## 架构

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   前端页面    │────▶│   API 服务    │────▶│   任务队列   │
│  (静态HTML)  │     │  (Express)   │     │  (BullMQ)   │
└─────────────┘     └──────────────┘     └──────┬──────┘
                                                │
                                     ┌──────────┴──────────┐
                                     ▼                     ▼
                              ┌─────────────┐      ┌─────────────┐
                              │   Worker     │      │  Playwright  │
                              │  任务执行器   │─────▶│  无头浏览器   │
                              └─────────────┘      └─────────────┘
```

## 环境要求

- Node.js >= 18
- Redis >= 6
- Python >= 3.8（可选，用于 Excel 解析）

## 安装

```bash
# 安装依赖
npm install

# 安装 Playwright 浏览器
npx playwright install chromium
```

## 配置

环境变量（可选）：

```bash
# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# 服务端口
PORT=3001
```

## 运行

```bash
# 方式一：同时启动 API 和 Worker
npm run dev

# 方式二：分别启动
npm start      # 启动 API 服务
npm run worker # 启动 Worker
```

访问 http://localhost:3001 打开管理界面。

## API 接口

### 上传文件
```
POST /api/upload
Content-Type: multipart/form-data

FormData:
  - goods: 商品数据文件 (.xlsx)
  - report: 直通车数据文件 (.xls)

Response: { success, goodsFile, reportFile }
```

### 提交任务
```
POST /api/tasks
Content-Type: application/json

Body: {
  scriptType: "batch_pause_promotion" | "batch_delist_goods",
  goodsFile: "文件名",
  reportFile: "文件名"
}

Response: { success, taskId }
```

### 实时日志（SSE）
```
GET /api/tasks/:taskId/logs

Event: data: {"type":"log","message":"..."}
Event: data: {"type":"progress","progress":50}
Event: data: {"type":"done","message":"..."}
Event: data: {"type":"error","message":"..."}
```

### 任务状态
```
GET /api/tasks/:taskId

Response: { id, type, state, progress, result, logs }
```

### 导入 Cookies
```
POST /api/cookies/import
Content-Type: application/json

Body: { cookies: [{name, value, domain, ...}] }

Response: { success, message }
```

### Cookies 状态
```
GET /api/cookies/status

Response: { exists, lastModified }
```

## 使用流程

1. **首次使用**：导入拼多多登录 cookies
   - 在浏览器中登录拼多多商家后台
   - 使用浏览器插件导出 cookies（如 EditThisCookie）
   - 通过页面或 API 导入 cookies

2. **上传文件**：上传商品数据和直通车数据 Excel 文件

3. **执行任务**：选择任务类型并执行

## 任务类型

| 类型 | 说明 | 批次大小 |
|------|------|----------|
| batch_pause_promotion | 批量暂停推广 | 30 |
| batch_delist_goods | 批量下架商品 | 10 |

## 目录结构

```
yundaun/
├── src/
│   ├── server.js          # API 服务
│   ├── worker.js          # 任务 Worker
│   ├── lib/
│   │   ├── queue.js       # BullMQ 队列配置
│   │   ├── browser.js     # 浏览器管理
│   │   └── excel-parser.js # Excel 解析
│   └── scripts/
│       ├── batch-pause-promotion.js
│       └── batch-delist-goods.js
├── public/
│   └── index.html         # 管理界面
├── data/                  # 数据文件
├── uploads/               # 上传文件
├── browser-data/          # 浏览器持久化数据
├── package.json
└── README.md
```
