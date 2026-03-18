# =========================================
# 阶段 1: 准备 Node 环境
# =========================================
FROM node:22-bookworm-slim AS node_base

# =========================================
# 阶段 2: 构建最终镜像 (基于 Manim)
# =========================================
FROM manimcommunity/manim:stable
USER root

# 1. 复制 Node.js (从 node_base 偷过来)
COPY --from=node_base /usr/local/bin /usr/local/bin
COPY --from=node_base /usr/local/lib/node_modules /usr/local/lib/node_modules

# 2. 【关键】安装 Redis 和 中文字体 (fonts-noto-cjk)
# 使用阿里云源加速
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && \
    apt-get install -y redis-server fonts-noto-cjk ffmpeg

WORKDIR /app

# 3. 复制 package.json
COPY package.json package-lock.json* ./
COPY frontend/package.json frontend/package-lock.json* ./frontend/

# 4. 设置 npm 淘宝源
RUN npm config set registry https://registry.npmmirror.com

# 5. 安装依赖
RUN npm install && npm --prefix frontend install

# 6. 复制源码并构建 React
COPY . .

# 7. 下载 BGM 音频文件（HF Space 同步时排除了二进制文件）
RUN mkdir -p src/audio/tracks && \
    curl -fsSL --retry 5 --retry-delay 5 -o src/audio/tracks/clavier-music-soft-piano-music-312509.mp3 \
      "https://github.com/Wing900/ManimCat/raw/main/src/audio/tracks/clavier-music-soft-piano-music-312509.mp3" && \
    curl -fsSL --retry 5 --retry-delay 5 -o src/audio/tracks/the_mountain-soft-piano-background-444129.mp3 \
      "https://github.com/Wing900/ManimCat/raw/main/src/audio/tracks/the_mountain-soft-piano-background-444129.mp3" && \
    curl -fsSL --retry 5 --retry-delay 5 -o src/audio/tracks/viacheslavstarostin-relaxing-soft-piano-music-431679.mp3 \
      "https://github.com/Wing900/ManimCat/raw/main/src/audio/tracks/viacheslavstarostin-relaxing-soft-piano-music-431679.mp3" || true && \
    ls -lh src/audio/tracks/

RUN npm run build

ENV PORT=7860
EXPOSE 7860

CMD ["node", "start-with-redis-hf.cjs"]
