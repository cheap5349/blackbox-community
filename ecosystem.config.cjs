// PM2 配置：裸机部署黑盒社区 API
// 使用：pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: 'heibox-api',
      script: 'server/index.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      out_file: './logs/out.log',
      error_file: './logs/err.log',
      merge_logs: true,
      time: true,
    },
  ],
}
