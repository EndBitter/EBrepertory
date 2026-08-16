# BitterMusicPlayer Meting 音乐源代理服务
# 基于 Node.js 18+ 运行，暴露端口 8300
FROM node:18-alpine

WORKDIR /app

# 安装依赖
COPY package.json ./
RUN npm install --production

# 复制源码
COPY index.js ./

# 服务端口
EXPOSE 8300

# 启动
CMD ["node", "index.js"]