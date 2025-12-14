# Docker Compose 部署指南

## 快速开始

### 1. 准备环境变量文件

复制环境变量示例文件：
```bash
cp .env.example .env
```

编辑 `.env` 文件，**至少修改以下必需配置**：
- `HANDY_MASTER_SECRET`: 生成一个安全的密钥（可以使用 `openssl rand -base64 32` 生成）
- `S3_PUBLIC_URL`: 根据实际部署情况设置 S3 公开访问 URL

### 2. 构建并启动服务

```bash
# 构建并启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 查看特定服务的日志
docker-compose logs -f app
```

### 3. 运行数据库迁移

应用启动后，需要运行数据库迁移：

```bash
# 进入应用容器
docker-compose exec app sh

# 在容器内运行迁移
yarn prisma migrate deploy
```

或者使用 docker-compose 直接运行：

```bash
docker-compose exec app yarn prisma migrate deploy
```

### 4. 验证部署

- **应用健康检查**: http://localhost:3005/health
- **应用根路径**: http://localhost:3005/
- **MinIO 控制台**: http://localhost:9001 (用户名/密码: minioadmin/minioadmin)
- **Prometheus 指标**: http://localhost:9090/metrics

## 服务说明

### 服务列表

| 服务名 | 端口 | 说明 |
|--------|------|------|
| `app` | 3005 | Happy Server 主应用 |
| `postgres` | 5432 | PostgreSQL 数据库 |
| `redis` | 6379 | Redis 缓存 |
| `minio` | 9000, 9001 | MinIO S3 兼容存储（API 和控制台） |

### 数据持久化

所有数据都保存在 Docker volumes 中：
- `postgres_data`: PostgreSQL 数据
- `redis_data`: Redis 数据
- `minio_data`: MinIO 文件存储

## 常用命令

### 启动和停止

```bash
# 启动所有服务（后台运行）
docker-compose up -d

# 启动并查看日志
docker-compose up

# 停止所有服务
docker-compose stop

# 停止并删除容器
docker-compose down

# 停止并删除容器和 volumes（⚠️ 会删除所有数据）
docker-compose down -v
```

### 查看状态

```bash
# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f [service_name]

# 查看资源使用情况
docker-compose top
```

### 数据库操作

```bash
# 运行数据库迁移
docker-compose exec app yarn prisma migrate deploy

# 重置数据库（⚠️ 会删除所有数据）
docker-compose exec app yarn prisma migrate reset

# 进入 PostgreSQL 命令行
docker-compose exec postgres psql -U postgres -d handy
```

### 应用操作

```bash
# 查看应用日志
docker-compose logs -f app

# 重启应用
docker-compose restart app

# 进入应用容器
docker-compose exec app sh

# 重新构建应用镜像
docker-compose build app

# 重新构建并启动
docker-compose up -d --build app
```

## 环境变量说明

### 必需配置

- `HANDY_MASTER_SECRET`: 主加密密钥，用于端到端加密。**必须设置且妥善保管**。

### 可选配置

- **数据库**: 默认使用 `postgres/postgres/handy`
- **Redis**: 默认配置即可
- **MinIO**: 默认使用 `minioadmin/minioadmin`，生产环境请修改
- **GitHub 集成**: 如需 GitHub 功能，配置相关变量
- **ElevenLabs**: 如需语音功能，配置 API 密钥

## 生产环境部署建议

1. **修改默认密码**:
   - 修改 `POSTGRES_PASSWORD`
   - 修改 `MINIO_ROOT_USER` 和 `MINIO_ROOT_PASSWORD`

2. **安全配置**:
   - 使用强密码生成 `HANDY_MASTER_SECRET`
   - 配置防火墙规则，只开放必要端口
   - 使用 HTTPS 反向代理（如 Nginx）

3. **S3_PUBLIC_URL**:
   - 如果使用域名，设置为 `https://your-domain.com/happy-files`
   - 如果使用 MinIO，确保端口可访问或配置反向代理

4. **资源限制**:
   可以在 `docker-compose.yml` 中为每个服务添加资源限制：
   ```yaml
   deploy:
     resources:
       limits:
         cpus: '1'
         memory: 1G
       reservations:
         cpus: '0.5'
         memory: 512M
   ```

5. **备份策略**:
   - 定期备份 PostgreSQL 数据卷
   - 备份 MinIO 数据卷
   - 备份 Redis 数据（如需要）

## 故障排查

### 应用无法启动

1. 检查所有依赖服务是否正常运行：
   ```bash
   docker-compose ps
   ```

2. 查看应用日志：
   ```bash
   docker-compose logs app
   ```

3. 检查环境变量是否正确：
   ```bash
   docker-compose exec app env | grep -E "(DATABASE_URL|REDIS_URL|HANDY_MASTER_SECRET)"
   ```

### 数据库连接失败

1. 检查 PostgreSQL 是否健康：
   ```bash
   docker-compose exec postgres pg_isready -U postgres
   ```

2. 检查 `DATABASE_URL` 环境变量是否正确

### MinIO bucket 未创建

MinIO 初始化服务会自动创建 bucket，如果失败：

1. 手动创建 bucket：
   ```bash
   docker-compose exec minio-init sh
   # 在容器内执行初始化命令
   ```

2. 或通过 MinIO 控制台手动创建：http://localhost:9001

### 端口冲突

如果端口被占用，修改 `.env` 文件中的端口配置：
- `APP_PORT`: 应用端口
- `POSTGRES_PORT`: PostgreSQL 端口
- `REDIS_PORT`: Redis 端口
- `MINIO_API_PORT`: MinIO API 端口
- `MINIO_CONSOLE_PORT`: MinIO 控制台端口

## 更新应用

```bash
# 拉取最新代码
git pull

# 重新构建并启动
docker-compose up -d --build app

# 运行数据库迁移（如有新迁移）
docker-compose exec app yarn prisma migrate deploy
```
