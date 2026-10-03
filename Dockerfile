# ===== 构建阶段：安装依赖并构建前端 =====
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
# 移除开发依赖，只保留运行所需
RUN npm prune --omit=dev

# ===== 运行阶段：Node 服务 + 静态托管 dist =====
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server/index.js"]
