# ManimCat 部署文档

简体中文 | [English](https://github.com/Wing900/ManimCat/blob/main/DEPLOYMENT.md)

本文档包含三种部署方式：本地部署、本地 Docker 部署、Hugging Face Spaces（Docker）。

三种部署都是可行的，hf的部署使用免费的服务器已经足够。

## 本地部署

### 阶段 1: 准备 Node 环境

1. 安装 Node.js >= 18
2. 安装 Redis 7 并保持 `localhost:6379` 可用
3. 安装 Python 3.11、Manim Community Edition 0.19.2、mypy、LaTeX (texlive)、ffmpeg、Xvfb

### 阶段 2: 拉取代码并配置环境变量

```bash
git clone https://github.com/yourusername/ManimCat.git
cd ManimCat
cp .env.example .env
```

在 `.env` 中配置服务端按 key 分流（推荐）：

```env
MANIMCAT_ROUTE_KEYS=user_key_a,user_key_b
MANIMCAT_ROUTE_API_URLS=https://api-a.example.com/v1,https://api-b.example.com/v1
MANIMCAT_ROUTE_API_KEYS=sk-a,sk-b
MANIMCAT_ROUTE_MODELS=qwen3.5-plus,gemini-3-flash-preview
```

可选：

```env
LOG_LEVEL=info
PROD_SUMMARY_LOG_ONLY=false
```

### 阶段 3: 安装依赖

```bash
npm install
python -m pip install mypy
cd frontend && npm install
cd ..
```

### 阶段 4: 构建并启动

```bash
npm run build
npm start
```

访问：`http://localhost:3000`

---

## 本地 Docker 部署

### 阶段 1: 准备 Docker 环境

1. 安装 Docker 20.10+ 与 Docker Compose 2.0+

### 阶段 2: 配置环境变量

```bash
cp .env.production .env
```

在 `.env` 中配置服务端按 key 分流（推荐）：

```env
MANIMCAT_ROUTE_KEYS=user_key_a,user_key_b
MANIMCAT_ROUTE_API_URLS=https://api-a.example.com/v1,https://api-b.example.com/v1
MANIMCAT_ROUTE_API_KEYS=sk-a,sk-b
MANIMCAT_ROUTE_MODELS=qwen3.5-plus,gemini-3-flash-preview
```

生产推荐额外设置：

```env
NODE_ENV=production
LOG_LEVEL=info
PROD_SUMMARY_LOG_ONLY=true

# 按 key 路由到不同上游
MANIMCAT_ROUTE_KEYS=user_key_a,user_key_b
MANIMCAT_ROUTE_API_URLS=https://api-a.example.com/v1,https://api-b.example.com/v1
MANIMCAT_ROUTE_API_KEYS=sk-a,sk-b
MANIMCAT_ROUTE_MODELS=qwen3.5-plus,gemini-3-flash-preview
```

### 阶段 3: 构建并启动

```bash
docker-compose build
docker-compose up -d
```

### 阶段 4: 验证服务

访问：`http://localhost:3000`

---

## Hugging Face 部署（Docker）

### 前置说明

- 需要 Docker Space（SDK 选择 Docker）
- 推荐 CPU upgrade（4 vCPU / 32GB）
- 默认端口为 7860
- Hugging Face 运行时环境变量来自 **Space Settings -> Variables/Secrets**，不是仓库里的 `.env`
- 启动日志出现 `injecting env (0) from .env` 属于正常现象，不代表 Settings 变量未生效

### 步骤

1. 准备 Space 仓库

```bash
git clone https://huggingface.co/spaces/YOUR_USERNAME/YOUR_SPACE_NAME
cd YOUR_SPACE_NAME
```

2. 复制项目文件

```bash
cp -r /path/to/ManimCat/* .
cp Dockerfile.huggingface Dockerfile
```

3. 在 Space Settings 中配置变量（必须在 Settings 中设置）

至少设置：

```env
PORT=7860
NODE_ENV=production
```

并配置服务端按 key 分流：

```env
MANIMCAT_ROUTE_KEYS=user_key_a,user_key_b
MANIMCAT_ROUTE_API_URLS=https://api-a.example.com/v1,https://api-b.example.com/v1
MANIMCAT_ROUTE_API_KEYS=sk-a,sk-b
MANIMCAT_ROUTE_MODELS=qwen3.5-plus,gemini-3-flash-preview
```

可选：

```env
LOG_LEVEL=info
PROD_SUMMARY_LOG_ONLY=true
```

如果你希望生产环境只保留每任务一条摘要日志，请确保以下三项都已在 Settings 配置并重启 Space：

```env
NODE_ENV=production
LOG_LEVEL=info
PROD_SUMMARY_LOG_ONLY=true
```

4. 推送并等待构建

```bash
git add .
git commit -m "Deploy ManimCat"
git push
```

部署完成后访问：`https://YOUR_SPACE.hf.space/`

---

## 按 ManimCat Key 分流（推荐）

### 目标

当你需要区分“测试用户 / 正式用户”时，推荐在服务端用 `MANIMCAT_ROUTE_*` 做固定路由：

- `user_key_a` 走上游 A（例如 `https://api-a.example.com/v1 + qwen3.5-plus + sk-a`）
- `user_key_b` 走上游 B（例如 `https://api-b.example.com/v1 + gemini-3-flash-preview + sk-b`）

### 配置方式

```env
MANIMCAT_ROUTE_KEYS=user_key_a,user_key_b
MANIMCAT_ROUTE_API_URLS=https://api-a.example.com/v1,https://api-b.example.com/v1
MANIMCAT_ROUTE_API_KEYS=sk-a,sk-b
MANIMCAT_ROUTE_MODELS=qwen3.5-plus,gemini-3-flash-preview
```

规则：

1. 以上四组变量都支持逗号或换行分隔。
2. 以 `MANIMCAT_ROUTE_KEYS` 为主索引逐项配对。
3. `apiUrl` 或 `apiKey` 缺失的条目会被跳过。
4. `model` 留空表示禁用该 key（后端可达但无可用模型）。
5. `MANIMCAT_ROUTE_KEYS` 本身就是认证白名单。

### 上游选择优先级（高 -> 低）

1. 请求体 `customApiConfig`（前端“激活自定义”时）
2. 命中 `MANIMCAT_ROUTE_*`（按 Bearer key 映射）

## 前端多组 Custom API（可选）

前端设置页仍支持多组 `url/key/model/manimcatKey` 轮询；它适合“同一浏览器用户自管多组上游”。  
如果你希望”不同用户固定走不同上游”，优先使用上面的服务端 `MANIMCAT_ROUTE_*`。

---

## 生成历史（可选，Supabase）

ManimCat 支持基于 Supabase 的持久化生成历史。数据库仅存储文字数据（提示词、生成的代码、元数据），**不存储**视频和图片文件。

### 设置

1. 在 [supabase.com](https://supabase.com) 创建一个免费项目
2. 在 Supabase SQL Editor 中运行迁移 SQL 脚本：

```sql
-- 文件: src/database/migrations/001_create_history.sql
-- 此脚本设置：
-- 1. history: 存储任务结果
-- 2. usage_stats: 存储持久化每日用量
-- 3. increment_usage: 原子计数器函数 (RPC)

create table if not exists history (
  id          uuid primary key default gen_random_uuid(),
  client_id   text not null,
  prompt      text not null,
  code        text,
  output_mode text not null check (output_mode in ('video', 'image')),
  quality     text not null check (quality in ('low', 'medium', 'high')),
  status      text not null check (status in ('completed', 'failed')),
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_history_client_created on history (client_id, created_at desc);
create index if not exists idx_history_status on history (status);

create table if not exists usage_stats (
  date               date primary key,
  submitted_total    integer default 0,
  submitted_generate integer default 0,
  submitted_modify   integer default 0,
  completed_total    integer default 0,
  failed_total       integer default 0,
  cancelled_total    integer default 0,
  completed_video    integer default 0,
  completed_image    integer default 0,
  render_ms_sum      bigint default 0,
  updated_at         timestamptz default now()
);

create or replace function increment_usage(
  target_date date,
  inc_submitted_total int default 0,
  inc_submitted_generate int default 0,
  inc_submitted_modify int default 0,
  inc_completed_total int default 0,
  inc_failed_total int default 0,
  inc_cancelled_total int default 0,
  inc_completed_video int default 0,
  inc_completed_image int default 0,
  inc_render_ms_sum bigint default 0
)
returns void
language plpgsql
security definer
as $$
begin
  insert into usage_stats (date, submitted_total, submitted_generate, submitted_modify, completed_total, failed_total, cancelled_total, completed_video, completed_image, render_ms_sum)
  values (target_date, inc_submitted_total, inc_submitted_generate, inc_submitted_modify, inc_completed_total, inc_failed_total, inc_cancelled_total, inc_completed_video, inc_completed_image, inc_render_ms_sum)
  on conflict (date) do update
  set
    submitted_total    = usage_stats.submitted_total + excluded.submitted_total,
    submitted_generate = usage_stats.submitted_generate + excluded.submitted_generate,
    submitted_modify   = usage_stats.submitted_modify + excluded.submitted_modify,
    completed_total    = usage_stats.completed_total + excluded.completed_total,
    failed_total       = usage_stats.failed_total + excluded.failed_total,
    cancelled_total    = usage_stats.cancelled_total + excluded.cancelled_total,
    completed_video    = usage_stats.completed_video + excluded.completed_video,
    completed_image    = usage_stats.completed_image + excluded.completed_image,
    render_ms_sum      = usage_stats.render_ms_sum + excluded.render_ms_sum,
    updated_at         = now();
end;
$$;
```


3. 在 `.env` 中添加以下环境变量：

```env
ENABLE_HISTORY_DB=true
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key
```

当 `ENABLE_HISTORY_DB` 为 `false`（默认值）时，历史记录 API 返回空结果，不会建立数据库连接。

## 可选：渲染失败事件导出

如果你希望采集并导出“仅渲染失败”事件，请增加以下环境变量：

```env
ENABLE_RENDER_FAILURE_LOG=true
ADMIN_EXPORT_TOKEN=replace_with_long_random_token
```

说明：
- 依赖数据库模式，并需要先执行迁移 `src/database/migrations/002_create_render_failure_events.sql`。
- 导出接口：`GET /api/admin/render-failures/export`，请求头需携带 `x-admin-token`。
