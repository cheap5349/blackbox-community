# 备份与恢复

## 需要备份的三类资产

| 资产 | 位置 | 丢了会怎样 |
| --- | --- | --- |
| 数据库 | MySQL 库 `heibox` | 账号、社区、帖子、评论、点赞、举报、通知全部丢失 |
| 媒体文件 | S3/MinIO 桶（`S3_BUCKET`），本地兜底模式为 Docker 卷 `uploads_data` 或 `server/uploads` | 帖子里残留死链，`media` JSON 指向不存在的对象 |
| 配置 | `.env`（尤其是 `JWT_SECRET`） | 换了密钥全体登录态失效；数据库与存储凭据需重新收集 |

**只备份数据库是不够的**：`posts.media` 存的是对象键与 URL，媒体本体不在库里。

## 备份

### 数据库

容器部署：

```bash
docker compose exec -T mysql mysqldump \
  -uroot -p"$MYSQL_ROOT_PASSWORD" \
  --single-transaction --routines --triggers \
  heibox | gzip > backup/heibox-$(date +%Y%m%d-%H%M).sql.gz
```

裸机部署：

```bash
mysqldump -u root -p --single-transaction --routines --triggers heibox \
  | gzip > backup/heibox-$(date +%Y%m%d-%H%M).sql.gz
```

`--single-transaction` 保证 InnoDB 表在不锁库的前提下拿到一致性快照，线上可直接执行。

### 媒体

S3/MinIO（对象存储是权威副本）：

```bash
mc mirror --overwrite minio/heibox backup/media/heibox
# 或使用 AWS CLI
aws s3 sync s3://heibox backup/media/heibox --endpoint-url "$S3_ENDPOINT"
```

本地兜底模式：

```bash
docker run --rm -v uploads_data:/data -v "$PWD/backup:/backup" alpine \
  tar czf /backup/uploads-$(date +%Y%m%d).tar.gz -C /data .
```

### 配置

```bash
cp .env backup/env-$(date +%Y%m%d).bak
chmod 600 backup/env-*.bak
```

`.env` 含密钥，备份目录不要放进任何会同步到公共位置的路径。

## 恢复

恢复顺序不能颠倒：先有库、再有媒体，最后起服务。

```bash
# 1. 停写（避免恢复期间产生新数据）
docker compose stop api

# 2. 建回数据库并导入
docker compose exec -T mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e \
  "DROP DATABASE IF EXISTS heibox; CREATE DATABASE heibox DEFAULT CHARACTER SET utf8mb4;"
gunzip -c backup/heibox-20250101-0300.sql.gz | \
  docker compose exec -T mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" heibox

# 3. 恢复媒体
mc mirror --overwrite backup/media/heibox minio/heibox
# 本地兜底模式：
docker run --rm -v uploads_data:/data -v "$PWD/backup:/backup" alpine \
  sh -c 'rm -rf /data/* && tar xzf /backup/uploads-20250101.tar.gz -C /data'

# 4. 恢复配置（如换了机器）
cp backup/env-20250101.bak .env

# 5. 起服务并验证
docker compose up -d api
curl -f http://127.0.0.1:3000/api/health
```

## 恢复演练（建议每季度一次）

不要等到真出事才第一次跑恢复流程。演练时恢复到一个**独立的库名**，不碰生产：

```bash
docker compose exec -T mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e \
  "DROP DATABASE IF EXISTS heibox_restore; CREATE DATABASE heibox_restore DEFAULT CHARACTER SET utf8mb4;"
gunzip -c backup/heibox-latest.sql.gz | \
  docker compose exec -T mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" heibox_restore

docker compose exec -T mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" heibox_restore -e "
  SELECT 'users' t, COUNT(*) n FROM users
  UNION ALL SELECT 'posts', COUNT(*) FROM posts
  UNION ALL SELECT 'comments', COUNT(*) FROM comments
  UNION ALL SELECT 'communities', COUNT(*) FROM communities
  UNION ALL SELECT 'likes', COUNT(*) FROM likes
  UNION ALL SELECT 'notifications', COUNT(*) FROM notifications;"
```

验证清单：

- [ ] 行数与备份前一致（允许存在备份点之后的新增）。
- [ ] 随机抽查 3 个帖子的 `media` 字段，逐一确认对应文件在存储里存在且能通过 URL 打开。
- [ ] `mysql -e "CHECK TABLE posts, users, comments"` 无报错。
- [ ] 用恢复库起一个临时实例（`DB_NAME=heibox_restore`）能正常登录、浏览、发帖。

任何一条不过，说明备份不可信，当天重新做一次完整备份。

## 频率与保留

| 资产 | 频率 | 保留 |
| --- | --- | --- |
| 数据库全量 | 每日一次（低峰期） | 最近 7 天日备 + 最近 4 周周备 |
| 数据库增量 | 有 binlog 时按需做时间点恢复（PITR） | 与全量同期 |
| 媒体 | 每周镜像一次（对象存储本身已有冗余） | 最近 4 周 |
| `.env` | 配置变更时手动留存 | 保留最近 3 份 |

## 恢复失败的常见原因

| 现象 | 原因 |
| --- | --- |
| 导入报 `Unknown database 'heibox'` | 忘了先 `CREATE DATABASE`，`mysqldump` 默认不带建库语句 |
| 导入后字符乱码 | 库或连接字符集不是 `utf8mb4` |
| 登录态全部失效 | `.env` 里的 `JWT_SECRET` 与备份时不一致 |
| 帖子能开但图片全 404 | 只恢复了数据库，没恢复媒体 |
| 恢复后部分帖子 `media` 为空 | 备份时 `posts.media` 为 JSON 列，导入用了会丢类型的文本工具 |
