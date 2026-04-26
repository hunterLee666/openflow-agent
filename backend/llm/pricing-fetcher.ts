import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

export interface ModelPricing {
  model: string;
  provider: string;
  providerId: string;
  modelId: string;
  inputCostPerMTok: number;
  outputCostPerMTok: number;
  cacheReadCostPerMTok?: number;
  cacheWriteCostPerMTok?: number;
  contextLimit?: number;
  outputLimit?: number;
  supportsToolCall?: boolean;
  supportsReasoning?: boolean;
  lastUpdated: string;
}

export interface PricingCache {
  models: Record<string, ModelPricing>;
  lastFetchTime: string;
  source: string;
  totalModels: number;
}

const PRICING_CACHE_FILE = ".openflow/pricing-cache.json";
const MODELS_DEV_API = "https://models.dev/api.json";
const CACHE_TTL_HOURS = 24;

export class PricingFetcher {
  private cachePath: string;

  constructor(workspaceRoot: string) {
    this.cachePath = resolve(workspaceRoot, PRICING_CACHE_FILE);
  }

  async fetchPricing(): Promise<PricingCache> {
    try {
      console.log("正在从 models.dev 获取模型定价信息...");

      const response = await fetch(MODELS_DEV_API, {
        signal: AbortSignal.timeout(15000),
        headers: {
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const pricing = this.parseModelsDevPricing(data);

      if (Object.keys(pricing).length === 0) {
        throw new Error("未获取到任何模型数据");
      }

      const cache: PricingCache = {
        models: pricing,
        lastFetchTime: new Date().toISOString(),
        source: "models.dev",
        totalModels: Object.keys(pricing).length,
      };

      await this.saveCache(cache);
      console.log(`成功从 models.dev 获取 ${Object.keys(pricing).length} 个模型的定价信息`);

      return cache;
    } catch (error) {
      console.error("从 models.dev 获取定价失败:", error);
      console.log("尝试加载缓存...");

      const cached = await this.loadCacheWithoutRefresh();
      if (cached) {
        console.log(`使用缓存数据 (${Object.keys(cached.models).length} 个模型)`);
        return cached;
      }

      console.log("无可用缓存，返回空定价信息");
      return {
        models: {},
        lastFetchTime: new Date().toISOString(),
        source: "none",
        totalModels: 0,
      };
    }
  }

  private parseModelsDevPricing(data: any): Record<string, ModelPricing> {
    const pricing: Record<string, ModelPricing> = {};

    if (!Array.isArray(data)) {
      console.warn("models.dev API 返回格式异常：期望数组");
      return pricing;
    }

    for (const model of data) {
      const modelId = model.model_id || model.id;
      if (!modelId) continue;

      const key = `${model.provider_id}/${modelId}`.toLowerCase();

      pricing[key] = {
        model: modelId,
        provider: model.provider || "unknown",
        providerId: model.provider_id || "unknown",
        modelId,
        inputCostPerMTok: model.input_cost_per_million_tokens || 0,
        outputCostPerMTok: model.output_cost_per_million_tokens || 0,
        cacheReadCostPerMTok: model.cache_read_cost_per_million_tokens,
        cacheWriteCostPerMTok: model.cache_write_cost_per_million_tokens,
        contextLimit: model.context_limit,
        outputLimit: model.output_limit,
        supportsToolCall: model.supports_tool_call,
        supportsReasoning: model.supports_reasoning,
        lastUpdated: model.last_updated || new Date().toISOString(),
      };
    }

    return pricing;
  }

  async loadCache(): Promise<PricingCache | null> {
    if (!existsSync(this.cachePath)) {
      return null;
    }

    try {
      const content = await readFile(this.cachePath, "utf-8");
      const cache: PricingCache = JSON.parse(content);

      const lastFetch = new Date(cache.lastFetchTime);
      const hoursSinceFetch = (Date.now() - lastFetch.getTime()) / (1000 * 60 * 60);

      if (hoursSinceFetch > CACHE_TTL_HOURS) {
        console.log(`定价缓存已过期 (${hoursSinceFetch.toFixed(1)} 小时前)，正在更新...`);
        return await this.fetchPricing();
      }

      return cache;
    } catch (error) {
      console.warn("加载定价缓存失败:", error);
      return null;
    }
  }

  private async loadCacheWithoutRefresh(): Promise<PricingCache | null> {
    if (!existsSync(this.cachePath)) {
      return null;
    }

    try {
      const content = await readFile(this.cachePath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async saveCache(cache: PricingCache): Promise<void> {
    const dir = this.cachePath.substring(0, this.cachePath.lastIndexOf("/"));
    await mkdir(dir, { recursive: true });
    await writeFile(this.cachePath, JSON.stringify(cache, null, 2), "utf-8");
  }

  async getPricing(model: string, provider?: string): Promise<ModelPricing | null> {
    const cache = await this.loadCache();
    if (!cache) return null;

    const searchKey = model.toLowerCase();

    if (provider) {
      const key = `${provider}/${searchKey}`;
      if (cache.models[key]) return cache.models[key];
    }

    for (const [key, info] of Object.entries(cache.models)) {
      if (key.endsWith(searchKey) || info.modelId.toLowerCase() === searchKey) {
        return info;
      }
    }

    return null;
  }

  async getAllPricing(): Promise<Record<string, ModelPricing>> {
    const cache = await this.loadCache();
    if (!cache) return {};

    return cache.models;
  }

  async searchPricing(query: string): Promise<ModelPricing[]> {
    const cache = await this.loadCache();
    if (!cache) return [];

    const lowerQuery = query.toLowerCase();

    return Object.values(cache.models).filter(
      (info) =>
        info.model.toLowerCase().includes(lowerQuery) ||
        info.provider.toLowerCase().includes(lowerQuery) ||
        info.providerId.toLowerCase().includes(lowerQuery)
    );
  }
}

export function createPricingFetcher(workspaceRoot: string): PricingFetcher {
  return new PricingFetcher(workspaceRoot);
}
