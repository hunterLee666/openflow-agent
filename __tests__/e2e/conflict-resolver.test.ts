import { describe, it, expect, beforeEach } from "vitest";
import type { PermissionRule, PermissionContext, ConflictStrategy } from "../../backend/permissions/types.js";

const createMockRule = (overrides: Partial<PermissionRule> = {}): PermissionRule => ({
  id: `rule-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  source: "userSettings",
  behavior: "allow",
  priority: 1,
  ruleContent: {},
  ...overrides,
});

const createMockContext = (overrides: Partial<PermissionContext> = {}): PermissionContext => ({
  tool: "test",
  input: {},
  cwd: "/tmp",
  mode: "default",
  isReadOnly: false,
  isDestructive: false,
  isGitCommand: false,
  isNetworkCommand: false,
  ...overrides,
});

describe("E2E: Conflict Resolver Flow", () => {
  describe("ConflictResolver", () => {
    it("should create resolver with default strategy", async () => {
      const { ConflictResolver } = await import("../../backend/permissions/conflict-resolver.js");
      
      const resolver = new ConflictResolver();
      
      expect(resolver.getDefaultStrategy()).toBe("priority-wins");
    });

    it("should set default strategy", async () => {
      const { ConflictResolver } = await import("../../backend/permissions/conflict-resolver.js");
      
      const resolver = new ConflictResolver();
      resolver.setDefaultStrategy("deny-wins");
      
      expect(resolver.getDefaultStrategy()).toBe("deny-wins");
    });

    it("should return null for single rule", async () => {
      const { ConflictResolver } = await import("../../backend/permissions/conflict-resolver.js");
      
      const resolver = new ConflictResolver();
      const rule = createMockRule();
      
      const result = resolver.resolve([rule], createMockContext());
      
      expect(result).toBeNull();
    });

    it("should return null for empty rules", async () => {
      const { ConflictResolver } = await import("../../backend/permissions/conflict-resolver.js");
      
      const resolver = new ConflictResolver();
      
      const result = resolver.resolve([], createMockContext());
      
      expect(result).toBeNull();
    });
  });

  describe("Conflict Strategies", () => {
    it("should resolve with priority-wins strategy", async () => {
      const { ConflictResolver } = await import("../../backend/permissions/conflict-resolver.js");
      
      const resolver = new ConflictResolver();
      
      const lowPriority = createMockRule({ id: "low", priority: 1, behavior: "allow" });
      const highPriority = createMockRule({ id: "high", priority: 10, behavior: "deny" });
      
      const result = resolver.resolve([lowPriority, highPriority], createMockContext(), "priority-wins");
      
      expect(result).not.toBeNull();
      expect(result?.winningRule.id).toBe("high");
      expect(result?.resolvedAction).toBe("deny");
    });

    it("should resolve with deny-wins strategy", async () => {
      const { ConflictResolver } = await import("../../backend/permissions/conflict-resolver.js");
      
      const resolver = new ConflictResolver();
      
      const allowRule = createMockRule({ id: "allow", behavior: "allow", priority: 10 });
      const denyRule = createMockRule({ id: "deny", behavior: "deny", priority: 1 });
      
      const result = resolver.resolve([allowRule, denyRule], createMockContext(), "deny-wins");
      
      expect(result).not.toBeNull();
      expect(result?.winningRule.behavior).toBe("deny");
    });

    it("should resolve with allow-wins strategy", async () => {
      const { ConflictResolver } = await import("../../backend/permissions/conflict-resolver.js");
      
      const resolver = new ConflictResolver();
      
      const allowRule = createMockRule({ id: "allow", behavior: "allow", priority: 1 });
      const denyRule = createMockRule({ id: "deny", behavior: "deny", priority: 10 });
      
      const result = resolver.resolve([allowRule, denyRule], createMockContext(), "allow-wins");
      
      expect(result).not.toBeNull();
      expect(result?.winningRule.behavior).toBe("allow");
    });

    it("should resolve with most-specific-wins strategy", async () => {
      const { ConflictResolver } = await import("../../backend/permissions/conflict-resolver.js");
      
      const resolver = new ConflictResolver();
      
      const general = createMockRule({ 
        id: "general", 
        ruleContent: { pathPattern: "/**" }
      });
      const specific = createMockRule({ 
        id: "specific", 
        ruleContent: { pathPattern: "/src/**/*.ts" }
      });
      
      const result = resolver.resolve([general, specific], createMockContext(), "most-specific-wins");
      
      expect(result).not.toBeNull();
    });

    it("should resolve with newest-wins strategy", async () => {
      const { ConflictResolver } = await import("../../backend/permissions/conflict-resolver.js");
      
      const resolver = new ConflictResolver();
      
      const old = createMockRule({ 
        id: "old", 
        metadata: { createdAt: Date.now() - 10000 }
      });
      const newRule = createMockRule({ 
        id: "new", 
        metadata: { createdAt: Date.now() }
      });
      
      const result = resolver.resolve([old, newRule], createMockContext(), " newest-wins");
      
      expect(result).not.toBeNull();
      expect(result?.winningRule.id).toBe("new");
    });

    it("should resolve with oldest-wins strategy", async () => {
      const { ConflictResolver } = await import("../../backend/permissions/conflict-resolver.js");
      
      const resolver = new ConflictResolver();
      
      const old = createMockRule({ 
        id: "old", 
        metadata: { createdAt: Date.now() - 10000 }
      });
      const newRule = createMockRule({ 
        id: "new", 
        metadata: { createdAt: Date.now() }
      });
      
      const result = resolver.resolve([old, newRule], createMockContext(), "oldest-wins");
      
      expect(result).not.toBeNull();
      expect(result?.winningRule.id).toBe("old");
    });
  });

  describe("checkConditions", () => {
    it("should pass when no conditions", async () => {
      const { ConflictResolver } = await import("../../backend/permissions/conflict-resolver.js");
      
      const resolver = new ConflictResolver();
      const rule = createMockRule({ ruleContent: {} });
      
      const result = resolver.checkConditions(rule, createMockContext());
      
      expect(result).toBe(true);
    });

    it("should check time range condition", async () => {
      const { ConflictResolver } = await import("../../backend/permissions/conflict-resolver.js");
      
      const resolver = new ConflictResolver();
      
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTime = currentHour * 60 + currentMinute;
      
      const inRangeRule = createMockRule({
        ruleContent: {
          conditions: {
            timeRange: {
              start: "00:00",
              end: "23:59"
            }
          }
        }
      });
      
      const result = resolver.checkConditions(inRangeRule, createMockContext({ timestamp: Date.now() }));
      
      expect(result).toBe(true);
    });

    it("should check readonly context condition", async () => {
      const { ConflictResolver } = await import("../../backend/permissions/conflict-resolver.js");
      
      const resolver = new ConflictResolver();
      
      const readonlyRule = createMockRule({
        ruleContent: {
          conditions: {
            context: { readonly: true }
          }
        }
      });
      
      const validResult = resolver.checkConditions(readonlyRule, createMockContext({ isReadOnly: true }));
      expect(validResult).toBe(true);
      
      const invalidResult = resolver.checkConditions(readonlyRule, createMockContext({ isReadOnly: false }));
      expect(invalidResult).toBe(false);
    });

    it("should check git repo condition", async () => {
      const { ConflictResolver } = await import("../../backend/permissions/conflict-resolver.js");
      
      const resolver = new ConflictResolver();
      
      const gitRule = createMockRule({
        ruleContent: {
          conditions: {
            context: { gitRepo: true }
          }
        }
      });
      
      const validResult = resolver.checkConditions(gitRule, createMockContext({ isGitCommand: true }));
      expect(validResult).toBe(true);
      
      const invalidResult = resolver.checkConditions(gitRule, createMockContext({ isGitCommand: false }));
      expect(invalidResult).toBe(false);
    });

    it("should check count condition", async () => {
      const { ConflictResolver } = await import("../../backend/permissions/conflict-resolver.js");
      
      const resolver = new ConflictResolver();
      
      const countRule = createMockRule({
        id: "count-rule",
        ruleContent: {
          conditions: {
            count: { max: 3, windowMs: 60000 }
          }
        }
      });
      
      const ctx = createMockContext();
      
      expect(resolver.checkConditions(countRule, ctx)).toBe(true);
      expect(resolver.checkConditions(countRule, ctx)).toBe(true);
      expect(resolver.checkConditions(countRule, ctx)).toBe(true);
      expect(resolver.checkConditions(countRule, ctx)).toBe(false);
    });
  });

  describe("isRuleExpired", () => {
    it("should return false for rule without expiry", async () => {
      const { ConflictResolver } = await import("../../backend/permissions/conflict-resolver.js");
      
      const resolver = new ConflictResolver();
      const rule = createMockRule();
      
      expect(resolver.isRuleExpired(rule)).toBe(false);
    });

    it("should return false for non-expired rule", async () => {
      const { ConflictResolver } = await import("../../backend/permissions/conflict-resolver.js");
      
      const resolver = new ConflictResolver();
      const rule = createMockRule({
        metadata: { 
          createdAt: Date.now(),
          expiresAt: Date.now() + 10000 
        }
      });
      
      expect(resolver.isRuleExpired(rule)).toBe(false);
    });

    it("should return true for expired rule", async () => {
      const { ConflictResolver } = await import("../../backend/permissions/conflict-resolver.js");
      
      const resolver = new ConflictResolver();
      const rule = createMockRule({
        metadata: { 
          createdAt: Date.now() - 20000,
          expiresAt: Date.now() - 10000 
        }
      });
      
      expect(resolver.isRuleExpired(rule)).toBe(true);
    });
  });

  describe("Resolution Result", () => {
    it("should include all losing rules", async () => {
      const { ConflictResolver } = await import("../../backend/permissions/conflict-resolver.js");
      
      const resolver = new ConflictResolver();
      
      const winner = createMockRule({ id: "winner", priority: 10 });
      const loser1 = createMockRule({ id: "loser1", priority: 5 });
      const loser2 = createMockRule({ id: "loser2", priority: 3 });
      
      const result = resolver.resolve([winner, loser1, loser2], createMockContext());
      
      expect(result?.losingRules.length).toBe(2);
      expect(result?.losingRules.map(r => r.id)).toContain("loser1");
      expect(result?.losingRules.map(r => r.id)).toContain("loser2");
    });

    it("should include resolution strategy", async () => {
      const { ConflictResolver } = await import("../../backend/permissions/conflict-resolver.js");
      
      const resolver = new ConflictResolver();
      
      const rule1 = createMockRule({ priority: 1 });
      const rule2 = createMockRule({ priority: 2 });
      
      const result = resolver.resolve([rule1, rule2], createMockContext(), "deny-wins");
      
      expect(result?.resolutionStrategy).toBe("deny-wins");
    });
  });

  describe("Edge Cases", () => {
    it("should handle rules with same priority", async () => {
      const { ConflictResolver } = await import("../../backend/permissions/conflict-resolver.js");
      
      const resolver = new ConflictResolver();
      
      const rule1 = createMockRule({ id: "rule1", priority: 5 });
      const rule2 = createMockRule({ id: "rule2", priority: 5 });
      
      const result = resolver.resolve([rule1, rule2], createMockContext());
      
      expect(result).not.toBeNull();
    });

    it("should handle many conflicting rules", async () => {
      const { ConflictResolver } = await import("../../backend/permissions/conflict-resolver.js");
      
      const resolver = new ConflictResolver();
      
      const rules = Array(20).fill(null).map((_, i) => 
        createMockRule({ id: `rule-${i}`, priority: i })
      );
      
      const result = resolver.resolve(rules, createMockContext());
      
      expect(result).not.toBeNull();
      expect(result?.winningRule.id).toBe("rule-19");
    });

    it("should handle rules without metadata", async () => {
      const { ConflictResolver } = await import("../../backend/permissions/conflict-resolver.js");
      
      const resolver = new ConflictResolver();
      
      const rule1 = createMockRule({ metadata: undefined });
      const rule2 = createMockRule({ metadata: undefined });
      
      const result = resolver.resolve([rule1, rule2], createMockContext(), " newest-wins");
      
      expect(result).not.toBeNull();
    });
  });
});
