# Happy Server 客户端开发指南

本文档为客户端开发者提供接入 Happy Server API 的完整指南。

## 目录

- [概述](#概述)
- [认证机制](#认证机制)
- [HTTP API](#http-api)
- [WebSocket 实时通信](#websocket-实时通信)
- [错误处理](#错误处理)
- [最佳实践](#最佳实践)

---

## 概述

Happy Server 提供 RESTful HTTP API 和 WebSocket 实时通信两种接入方式：

- **HTTP API**: 用于 CRUD 操作，如创建 Session、获取 Machine 列表等
- **WebSocket**: 用于实时数据同步，如接收新消息、状态变更通知等

### 基础信息

| 项目 | 值 |
|------|-----|
| Base URL | `https://your-server.com` |
| API 版本 | `/v1/` 或 `/v2/` |
| 数据格式 | JSON |
| 字符编码 | UTF-8 |

---

## 认证机制

Happy Server 采用**双层认证**架构：

```
请求 → [API Key 验证] → [User Token 验证] → 业务处理
```

### 1. API Key（服务级别）

API Key 用于识别和授权客户端应用。

**重要说明**:
- 如果服务器配置了 `API_KEYS` 环境变量，**所有请求**（除白名单端点外）都必须包含 API Key
- 如果服务器未配置 `API_KEYS`，则跳过 API Key 验证（向后兼容模式）
- CLI 工具在连接时也需要提供 API Key（如果服务器已配置）

**请求头格式**:
```
X-API-Key: your_api_key_here
```

**白名单端点**（无需 API Key）:
- `GET /` - 服务首页
- `GET /health` - 健康检查

**示例**:
```bash
curl -X GET "https://api.example.com/v1/sessions" \
  -H "X-API-Key: your_api_key_here" \
  -H "Authorization: Bearer user_token_here"
```

### 2. User Token（用户级别）

User Token 用于标识具体用户身份，通过认证流程获取。

**请求头格式**:
```
Authorization: Bearer <token>
```

### 认证流程

Happy Server 支持两种认证方式：

#### 方式一：直接签名认证

适用于已有密钥对的客户端：

```
POST /v1/auth
Content-Type: application/json
X-API-Key: your_api_key_here  # 如果服务器配置了 API_KEYS

{
  "publicKey": "<base64_encoded_public_key>",
  "challenge": "<base64_encoded_challenge>",
  "signature": "<base64_encoded_signature>"
}
```

**响应**:
```json
{
  "success": true,
  "token": "eyJhbGciOiJFZDI1NTE5..."
}
```

**签名要求**:
- 使用 Ed25519 签名算法
- challenge 可以是任意数据（如时间戳）
- signature 是对 challenge 的签名

**注意**: 如果服务器配置了 `API_KEYS`，此请求必须包含 `X-API-Key` 请求头

#### 方式二：设备授权流程（推荐）

适用于 CLI 工具或需要手机扫码授权的场景：

**步骤 1**: CLI 发起授权请求
```
POST /v1/auth/request
Content-Type: application/json
X-API-Key: your_api_key_here  # 如果服务器配置了 API_KEYS

{
  "publicKey": "<base64_encoded_public_key>",
  "supportsV2": true
}
```

**响应**:
```json
{
  "state": "requested"
}
```

**步骤 2**: CLI 轮询授权状态
```
GET /v1/auth/request/status?publicKey=<base64_encoded_public_key>
X-API-Key: your_api_key_here  # 如果服务器配置了 API_KEYS
```

**响应（等待中）**:
```json
{
  "status": "pending",
  "supportsV2": true
}
```

**响应（已授权）**:
```json
{
  "status": "authorized",
  "supportsV2": true
}
```

**步骤 3**: 获取 Token
当状态变为 `authorized` 后，再次调用 `/v1/auth/request`：

```
POST /v1/auth/request
Content-Type: application/json
X-API-Key: your_api_key_here  # 如果服务器配置了 API_KEYS

{
  "publicKey": "<base64_encoded_public_key>",
  "supportsV2": true
}
```

**响应**:
```json
{
  "state": "authorized",
  "token": "eyJhbGciOiJFZDI1NTE5...",
  "response": "<encrypted_response>"
}
```

**重要**: 如果服务器配置了 `API_KEYS` 环境变量，CLI 在认证流程的所有步骤中都必须提供 `X-API-Key` 请求头

---

## HTTP API

### 通用请求头

所有请求（除白名单端点外）必须包含：

```
X-API-Key: <api_key>
Authorization: Bearer <user_token>
Content-Type: application/json
```

### Account API

#### 获取用户信息

```
GET /v1/account/profile
```

**响应**:
```json
{
  "id": "user_id",
  "timestamp": 1704355200000,
  "firstName": "John",
  "lastName": "Doe",
  "username": "johndoe",
  "avatar": {
    "path": "avatars/xxx.jpg",
    "url": "https://cdn.example.com/avatars/xxx.jpg"
  },
  "github": { /* GitHub profile if connected */ },
  "connectedServices": ["elevenlabs"]
}
```

#### 获取账户设置

```
GET /v1/account/settings
```

**响应**:
```json
{
  "settings": "<encrypted_settings_string>",
  "settingsVersion": 5
}
```

#### 更新账户设置

使用乐观锁机制防止并发冲突：

```
POST /v1/account/settings
Content-Type: application/json

{
  "settings": "<encrypted_settings_string>",
  "expectedVersion": 5
}
```

**成功响应**:
```json
{
  "success": true,
  "version": 6
}
```

**版本冲突响应**:
```json
{
  "success": false,
  "error": "version-mismatch",
  "currentVersion": 7,
  "currentSettings": "<current_encrypted_settings>"
}
```

### Sessions API

#### 获取 Session 列表

```
GET /v1/sessions
```

**响应**:
```json
{
  "sessions": [
    {
      "id": "session_id",
      "seq": 42,
      "createdAt": 1704355200000,
      "updatedAt": 1704358800000,
      "active": true,
      "activeAt": 1704358800000,
      "metadata": "<encrypted_metadata>",
      "metadataVersion": 3,
      "agentState": "<encrypted_agent_state>",
      "agentStateVersion": 1,
      "dataEncryptionKey": "<base64_key>",
      "lastMessage": null
    }
  ]
}
```

#### 获取活跃 Session（V2）

```
GET /v2/sessions/active?limit=50
```

仅返回最近 15 分钟内活跃的 Session。

#### 分页获取 Session（V2）

```
GET /v2/sessions?limit=50&cursor=cursor_v1_xxx&changedSince=1704355200000
```

**参数**:
- `limit`: 每页数量（1-200，默认 50）
- `cursor`: 分页游标
- `changedSince`: 仅返回此时间戳后更新的 Session（毫秒）

**响应**:
```json
{
  "sessions": [...],
  "nextCursor": "cursor_v1_xxx",
  "hasNext": true
}
```

#### 创建/获取 Session

使用 `tag` 实现幂等性，相同 tag 会返回已存在的 Session：

```
POST /v1/sessions
Content-Type: application/json

{
  "tag": "unique_session_tag",
  "metadata": "<encrypted_metadata>",
  "agentState": "<encrypted_agent_state>",
  "dataEncryptionKey": "<base64_key>"
}
```

**响应**:
```json
{
  "session": {
    "id": "session_id",
    "seq": 0,
    "metadata": "<encrypted_metadata>",
    "metadataVersion": 0,
    "agentState": null,
    "agentStateVersion": 0,
    "dataEncryptionKey": "<base64_key>",
    "active": true,
    "activeAt": 1704355200000,
    "createdAt": 1704355200000,
    "updatedAt": 1704355200000,
    "lastMessage": null
  }
}
```

#### 获取 Session 消息

```
GET /v1/sessions/:sessionId/messages
```

**响应**:
```json
{
  "messages": [
    {
      "id": "message_id",
      "seq": 1,
      "localId": "client_generated_id",
      "content": { /* encrypted message content */ },
      "createdAt": 1704355200000,
      "updatedAt": 1704355200000
    }
  ]
}
```

#### 删除 Session

```
DELETE /v1/sessions/:sessionId
```

**响应**:
```json
{
  "success": true
}
```

### Machines API

#### 获取 Machine 列表

```
GET /v1/machines
```

**响应**:
```json
[
  {
    "id": "machine_id",
    "metadata": "<encrypted_metadata>",
    "metadataVersion": 1,
    "daemonState": "<encrypted_daemon_state>",
    "daemonStateVersion": 1,
    "dataEncryptionKey": "<base64_key>",
    "seq": 5,
    "active": true,
    "activeAt": 1704355200000,
    "createdAt": 1704355200000,
    "updatedAt": 1704358800000
  }
]
```

#### 注册/获取 Machine

```
POST /v1/machines
Content-Type: application/json

{
  "id": "unique_machine_id",
  "metadata": "<encrypted_metadata>",
  "daemonState": "<encrypted_daemon_state>",
  "dataEncryptionKey": "<base64_key>"
}
```

#### 获取单个 Machine

```
GET /v1/machines/:id
```

### Access Keys API

用于管理 Session 和 Machine 之间的访问密钥：

#### 获取 Access Key

```
GET /v1/access-keys/:sessionId/:machineId
```

#### 创建 Access Key

```
POST /v1/access-keys/:sessionId/:machineId
Content-Type: application/json

{
  "data": "<encrypted_access_key_data>"
}
```

#### 更新 Access Key

```
PUT /v1/access-keys/:sessionId/:machineId
Content-Type: application/json

{
  "data": "<encrypted_access_key_data>",
  "expectedVersion": 1
}
```

---

## WebSocket 实时通信

### 连接配置

```javascript
const socket = io("https://api.example.com", {
  path: "/v1/updates",
  transports: ["websocket", "polling"],
  extraHeaders: {
    "X-API-Key": "your_api_key_here"  // 如果服务器配置了 API_KEYS
  },
  auth: {
    token: "user_token_here",
    clientType: "user-scoped",  // 或 "session-scoped" 或 "machine-scoped"
    sessionId: "xxx",           // session-scoped 必填
    machineId: "xxx"            // machine-scoped 必填
  }
});
```

**注意**: 
- 如果服务器配置了 `API_KEYS` 环境变量，WebSocket 连接时也需要在 HTTP upgrade 请求中包含 `X-API-Key` 请求头
- 使用 `extraHeaders` 选项（socket.io-client）或相应的配置项来添加 API Key

### 客户端类型

| 类型 | 说明 | 必填参数 |
|------|------|---------|
| `user-scoped` | 接收用户级别的所有更新 | 无 |
| `session-scoped` | 仅接收特定 Session 的更新 | `sessionId` |
| `machine-scoped` | 仅接收特定 Machine 的更新 | `machineId` |

### 事件监听

```javascript
// 连接成功
socket.on("connect", () => {
  console.log("Connected");
});

// 接收更新
socket.on("update", (payload) => {
  console.log("Received update:", payload);
  // payload.kind 表示更新类型
  // payload.data 包含更新数据
});

// 接收临时事件（不持久化）
socket.on("ephemeral", (payload) => {
  console.log("Received ephemeral:", payload);
});

// 错误处理
socket.on("error", (error) => {
  console.error("Socket error:", error);
});

// 断开连接
socket.on("disconnect", (reason) => {
  console.log("Disconnected:", reason);
});
```

### 更新类型 (payload.kind)

| kind | 说明 |
|------|------|
| `new-session` | 新 Session 创建 |
| `update-session` | Session 更新（metadata、agentState 等） |
| `delete-session` | Session 删除 |
| `new-machine` | 新 Machine 注册 |
| `update-machine` | Machine 更新 |
| `update-account` | 账户信息更新 |
| `machine-activity` | Machine 在线状态变更（临时事件） |

### 发送事件

#### Ping/Pong

```javascript
socket.emit("ping", { timestamp: Date.now() }, (response) => {
  console.log("Pong received:", response);
});
```

#### 更新 Session

```javascript
socket.emit("session-update", {
  sessionId: "xxx",
  metadata: "<encrypted>",
  metadataVersion: 3,
  agentState: "<encrypted>",
  agentStateVersion: 1
}, (response) => {
  if (response.success) {
    console.log("Update successful");
  } else {
    console.error("Update failed:", response.error);
  }
});
```

#### 报告使用量

```javascript
socket.emit("usage", {
  key: "unique_report_key",
  sessionId: "xxx",
  data: {
    tokens: { input: 1000, output: 500 },
    cost: { total: 0.05 }
  }
});
```

---

## 错误处理

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 认证失败（API Key 或 Token 无效） |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 409 | 资源冲突（如 Access Key 已存在） |
| 429 | 请求过于频繁 |
| 500 | 服务器内部错误 |

### 错误响应格式

```json
{
  "error": "Error message here"
}
```

### 版本冲突处理

对于使用乐观锁的 API（如 settings、access-keys），遇到版本冲突时：

1. 读取响应中的 `currentVersion` 和当前数据
2. 基于最新数据重新计算要更新的值
3. 使用新的 `expectedVersion` 重试请求

```javascript
async function updateWithRetry(data, expectedVersion, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await api.updateSettings({ data, expectedVersion });
    
    if (response.success) {
      return response;
    }
    
    if (response.error === 'version-mismatch') {
      // 合并本地更改和服务器数据
      data = mergeData(data, response.currentSettings);
      expectedVersion = response.currentVersion;
      continue;
    }
    
    throw new Error(response.error);
  }
  throw new Error('Max retries exceeded');
}
```

---

## 最佳实践

### 1. 幂等性设计

所有写操作都应设计为幂等：

- 使用 `tag` 创建 Session（相同 tag 返回已有 Session）
- 使用 `localId` 发送消息（防止重复）
- 使用 `expectedVersion` 更新数据（乐观锁）

### 2. 重试策略

```javascript
async function withRetry(fn, maxRetries = 3, baseDelay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      // 指数退避
      const delay = baseDelay * Math.pow(2, i);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
```

### 3. WebSocket 重连

```javascript
socket.on("disconnect", (reason) => {
  if (reason === "io server disconnect") {
    // 服务器主动断开，可能是 token 过期
    // 需要重新认证
    refreshToken().then(() => socket.connect());
  } else {
    // 自动重连
    socket.connect();
  }
});
```

### 4. 数据加密

所有敏感数据（metadata、agentState、settings 等）应在客户端加密后传输：

- 使用 `dataEncryptionKey` 进行端到端加密
- 服务器不存储明文数据
- 密钥仅在客户端之间共享

### 5. 时间戳处理

- 所有时间戳都是 **Unix 毫秒**
- 客户端应处理时区差异
- 使用 `changedSince` 参数进行增量同步

---

## 附录

### 依赖库推荐

| 平台 | HTTP 客户端 | WebSocket |
|------|------------|-----------|
| JavaScript/TypeScript | `axios` / `fetch` | `socket.io-client` |
| iOS (Swift) | `URLSession` / `Alamofire` | `Socket.IO-Client-Swift` |
| Android (Kotlin) | `OkHttp` / `Retrofit` | `socket.io-client-java` |
| Python | `requests` / `httpx` | `python-socketio` |

### 加密库推荐

- JavaScript: `tweetnacl`, `privacy-kit`
- iOS: `CryptoKit`
- Android: `Tink`
- Python: `PyNaCl`
