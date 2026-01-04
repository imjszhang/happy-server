import { Fastify } from "../types";
import { log } from "@/utils/log";
import crypto from "crypto";

// 白名单路径 - 这些路径不需要 API Key
const WHITELIST_PATHS = ["/", "/health"];

// 从环境变量加载有效的 API Keys
const validKeys = process.env.API_KEYS?.split(",").map((k) => k.trim()).filter((k) => k.length > 0) || [];

/**
 * 时间安全的字符串比较，防止时序攻击
 */
function timingSafeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
        return false;
    }
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * 检查提供的 key 是否在有效 key 列表中
 */
function isValidApiKey(apiKey: string): boolean {
    for (const validKey of validKeys) {
        if (timingSafeCompare(apiKey, validKey)) {
            return true;
        }
    }
    return false;
}

/**
 * 启用 API Key 认证
 * 
 * 从环境变量 API_KEYS 读取逗号分隔的有效 Key 列表。
 * 如果 API_KEYS 未设置或为空，则跳过验证（向后兼容）。
 * 白名单路径（/, /health）始终放行。
 */
export function enableApiKeyAuth(app: Fastify) {
    // 启动时记录配置状态
    if (validKeys.length === 0) {
        log({ module: "api-key-auth", level: "warn" }, "API_KEYS not configured - API Key validation is DISABLED. This is not recommended for production.");
    } else {
        log({ module: "api-key-auth" }, `API Key authentication enabled with ${validKeys.length} valid key(s)`);
    }

    app.addHook("onRequest", async (request, reply) => {
        // 提取路径（去除查询参数）
        const path = request.url.split("?")[0];

        // 白名单路径直接放行
        if (WHITELIST_PATHS.includes(path)) {
            return;
        }

        // 如果未配置 API Keys，跳过验证（向后兼容）
        if (validKeys.length === 0) {
            return;
        }

        // 提取 API Key
        const apiKey = request.headers["x-api-key"];

        // 检查是否提供了 API Key
        if (!apiKey || typeof apiKey !== "string") {
            log({ module: "api-key-auth" }, `Rejected request to ${path} - missing API Key`);
            return reply.code(401).send({ error: "Missing API Key" });
        }

        // 验证 API Key
        if (!isValidApiKey(apiKey)) {
            log({ module: "api-key-auth" }, `Rejected request to ${path} - invalid API Key`);
            return reply.code(401).send({ error: "Invalid API Key" });
        }

        // API Key 有效，继续处理
    });
}
