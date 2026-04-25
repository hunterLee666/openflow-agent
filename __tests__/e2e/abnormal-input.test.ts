import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Abnormal Input Handling E2E Tests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("Input Validation - Malformed Data", () => {
    it("should handle null input", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");

      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
        },
      };

      const result = safeValidateInput(schema, null);

      expect(result.ok).toBe(false);
    });

    it("should handle undefined input", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");

      const schema = {
        type: "object",
        properties: {
          value: { type: "number" },
        },
      };

      const result = safeValidateInput(schema, undefined);

      expect(result.ok).toBe(true);
    });

    it("should handle empty object input", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");

      const schema = {
        type: "object",
        properties: {
          required: { type: "string" },
        },
        required: ["required"],
      };

      const result = safeValidateInput(schema, {});

      expect(result.ok).toBe(false);
    });

    it("should handle wrong type input", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");

      const schema = {
        type: "object",
        properties: {
          count: { type: "number" },
        },
      };

      const result = safeValidateInput(schema, { count: "not a number" });

      expect(result.ok).toBe(false);
    });

    it("should handle deeply nested input", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");

      const schema = {
        type: "object",
        properties: {
          level1: {
            type: "object",
            properties: {
              level2: {
                type: "object",
                properties: {
                  level3: { type: "string" },
                },
              },
            },
          },
        },
      };

      const validInput = {
        level1: {
          level2: {
            level3: "deep value",
          },
        },
      };

      const result = safeValidateInput(schema, validInput);

      expect(result.ok).toBe(true);
    });

    it("should handle array input validation", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");

      const schema = {
        type: "array",
        items: {
          type: "string",
        },
      };

      const validResult = safeValidateInput(schema, ["a", "b", "c"]);
      expect(validResult.ok).toBe(true);

      const invalidResult = safeValidateInput(schema, [1, 2, 3]);
      expect(invalidResult.ok).toBe(false);
    });
  });

  describe("Input Validation - Boundary Values", () => {
    it("should handle empty string", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");

      const schema = {
        type: "string",
      };

      const result = safeValidateInput(schema, "");

      expect(result.ok).toBe(true);
    });

    it("should handle very long string", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");

      const schema = {
        type: "string",
      };

      const longString = "a".repeat(100000);
      const result = safeValidateInput(schema, longString);

      expect(result.ok).toBe(true);
    });

    it("should handle zero number", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");

      const schema = {
        type: "number",
      };

      const result = safeValidateInput(schema, 0);

      expect(result.ok).toBe(true);
    });

    it("should handle negative number", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");

      const schema = {
        type: "number",
      };

      const result = safeValidateInput(schema, -999999);

      expect(result.ok).toBe(true);
    });

    it("should handle floating point number", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");

      const schema = {
        type: "number",
      };

      const result = safeValidateInput(schema, 3.141592653589793);

      expect(result.ok).toBe(true);
    });

    it("should handle special numeric values", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");

      const schema = {
        type: "number",
      };

      const infinityResult = safeValidateInput(schema, Infinity);
      expect(infinityResult.ok).toBe(true);

      const negInfinityResult = safeValidateInput(schema, -Infinity);
      expect(negInfinityResult.ok).toBe(true);
    });

    it("should handle boolean values", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");

      const schema = {
        type: "boolean",
      };

      expect(safeValidateInput(schema, true).ok).toBe(true);
      expect(safeValidateInput(schema, false).ok).toBe(true);
    });

    it("should handle empty array", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");

      const schema = {
        type: "array",
        items: { type: "string" },
      };

      const result = safeValidateInput(schema, []);

      expect(result.ok).toBe(true);
    });

    it("should handle large array", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");

      const schema = {
        type: "array",
        items: { type: "number" },
      };

      const largeArray = Array(10000).fill(0).map((_, i) => i);
      const result = safeValidateInput(schema, largeArray);

      expect(result.ok).toBe(true);
    });
  });

  describe("Sensitive Data Masking - Injection Prevention", () => {
    it("should detect sensitive field names", async () => {
      const { isSensitiveField } = await import("../../backend/tools/masking.js");

      expect(isSensitiveField("password")).toBe(true);
      expect(isSensitiveField("api_key")).toBe(true);
      expect(isSensitiveField("secret")).toBe(true);
      expect(isSensitiveField("token")).toBe(false);
      expect(isSensitiveField("access_token")).toBe(true);
      expect(isSensitiveField("normal_field")).toBe(false);
    });

    it("should detect sensitive value patterns", async () => {
      const { isSensitiveValue } = await import("../../backend/tools/masking.js");

      expect(isSensitiveValue("sk-1234567890abcdefghijklmnopqrst")).toBe(true);
      expect(isSensitiveValue("ghp_1234567890abcdefghijklmnopqrstuvwx")).toBe(true);
      expect(isSensitiveValue("normal text")).toBe(false);
    });

    it("should mask sensitive fields in objects", async () => {
      const { maskObject } = await import("../../backend/tools/masking.js");

      const input = {
        username: "user1",
        password: "secret123",
        api_key: "key123",
        data: {
          nested: {
            secret: "nested_secret",
          },
        },
      };

      const masked = maskObject(input);

      expect(masked.username).toBe("user1");
      expect(masked.password).toBe("[REDACTED]");
      expect(masked.api_key).toBe("[REDACTED]");
    });

    it("should mask sensitive strings", async () => {
      const { maskSensitiveString } = await import("../../backend/tools/masking.js");

      const input = "password=secret123 api_key=sk-test1234567890abcdefghijklmnop";
      const masked = maskSensitiveString(input);

      expect(masked).not.toContain("secret123");
    });

    it("should mask private keys", async () => {
      const { maskSensitiveString } = await import("../../backend/tools/masking.js");

      const input = "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----";
      const masked = maskSensitiveString(input);

      expect(masked).toContain("[PRIVATE KEY REDACTED]");
      expect(masked).not.toContain("MIIEpAIBAAKCAQEA");
    });

    it("should mask JWT tokens", async () => {
      const { maskSensitiveString } = await import("../../backend/tools/masking.js");

      const input = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
      const masked = maskSensitiveString(input);

      expect(masked).toContain("[JWT REDACTED]");
    });

    it("should mask GitHub tokens", async () => {
      const { maskSensitiveString } = await import("../../backend/tools/masking.js");

      const input = "ghp_1234567890abcdefghijklmnopqrstuvwx";
      const masked = maskSensitiveString(input);

      expect(masked).toContain("[GITHUB TOKEN REDACTED]");
    });
  });

  describe("Command Output Masking", () => {
    it("should mask command output strings", async () => {
      const { maskCommandOutput } = await import("../../backend/tools/masking.js");

      const output = "export API_KEY=sk-1234567890abcdefghijklmnopqrst";
      const masked = maskCommandOutput(output);

      expect(masked).not.toContain("sk-1234567890abcdefghijklmnopqrst");
    });

    it("should mask command output objects", async () => {
      const { maskCommandOutput } = await import("../../backend/tools/masking.js");

      const output = {
        status: "success",
        credentials: {
          password: "secret123",
          token: "token123",
        },
      };

      const masked = maskCommandOutput(output) as Record<string, unknown>;

      expect(masked.status).toBe("success");
      expect((masked.credentials as Record<string, unknown>).password).toBe("[REDACTED]");
    });

    it("should mask command output arrays", async () => {
      const { maskCommandOutput } = await import("../../backend/tools/masking.js");

      const output = [
        { user: "user1", password: "pass1" },
        { user: "user2", password: "pass2" },
      ];

      const masked = maskCommandOutput(output) as Array<Record<string, unknown>>;

      expect(masked[0].password).toBe("[REDACTED]");
      expect(masked[1].password).toBe("[REDACTED]");
    });
  });

  describe("Validation Error Formatting", () => {
    it("should format validation errors", async () => {
      const { safeValidateInput, formatValidationError } = await import("../../backend/tools/validation.js");

      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
        required: ["name", "age"],
      };

      const result = safeValidateInput(schema, { name: 123 });

      if (!result.ok) {
        const formatted = formatValidationError(result);
        expect(typeof formatted).toBe("string");
        expect(formatted.length).toBeGreaterThan(0);
      }
    });

    it("should handle multiple validation errors", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");

      const schema = {
        type: "object",
        properties: {
          field1: { type: "string" },
          field2: { type: "number" },
          field3: { type: "boolean" },
        },
        required: ["field1", "field2", "field3"],
      };

      const result = safeValidateInput(schema, {
        field1: 123,
        field2: "not a number",
        field3: "not a boolean",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle circular reference in input", async () => {
      const { maskValue } = await import("../../backend/tools/masking.js");

      const circular: Record<string, unknown> = { name: "test" };
      circular.self = circular;

      expect(() => maskValue(circular)).not.toThrow();
    });

    it("should handle prototype pollution attempts", async () => {
      const { maskObject } = await import("../../backend/tools/masking.js");

      const malicious = {
        __proto__: { polluted: true },
        constructor: { prototype: { polluted: true } },
        normalField: "value",
      };

      const masked = maskObject(malicious);

      expect(masked.normalField).toBe("value");
    });

    it("should handle Symbol keys", async () => {
      const { maskObject } = await import("../../backend/tools/masking.js");

      const sym = Symbol("key");
      const input = {
        [sym]: "symbol value",
        normal: "normal value",
      };

      const masked = maskObject(input);

      expect(masked.normal).toBe("normal value");
    });

    it("should handle very deep nesting", async () => {
      const { maskValue } = await import("../../backend/tools/masking.js");

      let deep: Record<string, unknown> = { value: "deep" };
      for (let i = 0; i < 100; i++) {
        deep = { nested: deep };
      }

      expect(() => maskValue(deep)).not.toThrow();
    });

    it("should handle null values in objects", async () => {
      const { maskObject } = await import("../../backend/tools/masking.js");

      const input = {
        field1: null,
        field2: undefined,
        field3: "value",
      };

      const masked = maskObject(input);

      expect(masked.field1).toBeNull();
      expect(masked.field3).toBe("value");
    });

    it("should handle Date objects", async () => {
      const { maskValue } = await import("../../backend/tools/masking.js");

      const input = {
        date: new Date(),
        timestamp: Date.now(),
      };

      const masked = maskValue(input);

      expect(masked).toBeDefined();
    });

    it("should handle Buffer input", async () => {
      const { maskValue } = await import("../../backend/tools/masking.js");

      const input = {
        buffer: Buffer.from("test data"),
      };

      const masked = maskValue(input);

      expect(masked).toBeDefined();
    });

    it("should handle function values", async () => {
      const { maskValue } = await import("../../backend/tools/masking.js");

      const input = {
        fn: () => "test",
        normal: "value",
      };

      const masked = maskValue(input) as Record<string, unknown>;

      expect(masked.normal).toBe("value");
    });

    it("should handle regex patterns in values", async () => {
      const { maskSensitiveString } = await import("../../backend/tools/masking.js");

      const input = "password=/test.*pattern/";
      const masked = maskSensitiveString(input);

      expect(masked).toBeDefined();
    });

    it("should handle unicode in sensitive values", async () => {
      const { maskSensitiveString } = await import("../../backend/tools/masking.js");

      const input = "密码=password123";
      const masked = maskSensitiveString(input);

      expect(typeof masked).toBe("string");
    });
  });

  describe("Schema Validation Edge Cases", () => {
    it("should handle missing schema", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");

      const result = safeValidateInput(null, { any: "data" });

      expect(result.ok).toBe(true);
    });

    it("should handle empty schema", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");

      const result = safeValidateInput({}, { any: "data" });

      expect(result.ok).toBe(true);
    });

    it("should handle unknown schema type", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");

      const schema = {
        type: "unknown",
      };

      const result = safeValidateInput(schema, "test");

      expect(result.ok).toBe(true);
    });
  });
});
