import { describe, it, expect } from "vitest";

describe("E2E: Tool Validation Flow", () => {
  describe("safeValidateInput", () => {
    it("should return ok for null schema", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");
      const result = safeValidateInput(null, { name: "test" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual({ name: "test" });
      }
    });

    it("should return ok for undefined schema", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");
      const result = safeValidateInput(undefined, { name: "test" });
      expect(result.ok).toBe(true);
    });

    it("should validate string type", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");
      const schema = { type: "string" };
      
      const validResult = safeValidateInput(schema, "hello");
      expect(validResult.ok).toBe(true);
      
      const invalidResult = safeValidateInput(schema, 123);
      expect(invalidResult.ok).toBe(false);
    });

    it("should validate number type", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");
      const schema = { type: "number" };
      
      const validResult = safeValidateInput(schema, 42);
      expect(validResult.ok).toBe(true);
      
      const invalidResult = safeValidateInput(schema, "not a number");
      expect(invalidResult.ok).toBe(false);
    });

    it("should validate boolean type", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");
      const schema = { type: "boolean" };
      
      const validResult = safeValidateInput(schema, true);
      expect(validResult.ok).toBe(true);
      
      const invalidResult = safeValidateInput(schema, "true");
      expect(invalidResult.ok).toBe(false);
    });

    it("should validate array type", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");
      const schema = { 
        type: "array",
        items: { type: "string" }
      };
      
      const validResult = safeValidateInput(schema, ["a", "b", "c"]);
      expect(validResult.ok).toBe(true);
      
      const invalidResult = safeValidateInput(schema, [1, 2, 3]);
      expect(invalidResult.ok).toBe(false);
    });

    it("should validate object type with required fields", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" }
        },
        required: ["name"]
      };
      
      const validResult = safeValidateInput(schema, { name: "John", age: 30 });
      expect(validResult.ok).toBe(true);
      
      const validResult2 = safeValidateInput(schema, { name: "John" });
      expect(validResult2.ok).toBe(true);
      
      const invalidResult = safeValidateInput(schema, { age: 30 });
      expect(invalidResult.ok).toBe(false);
    });

    it("should validate nested objects", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");
      const schema = {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: "string" }
            },
            required: ["name"]
          }
        }
      };
      
      const validResult = safeValidateInput(schema, { 
        user: { name: "John", email: "john@example.com" } 
      });
      expect(validResult.ok).toBe(true);
      
      const invalidResult = safeValidateInput(schema, { 
        user: { email: "john@example.com" } 
      });
      expect(invalidResult.ok).toBe(false);
    });

    it("should validate arrays of objects", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");
      const schema = {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "number" },
            label: { type: "string" }
          },
          required: ["id"]
        }
      };
      
      const validResult = safeValidateInput(schema, [
        { id: 1, label: "First" },
        { id: 2 }
      ]);
      expect(validResult.ok).toBe(true);
      
      const invalidResult = safeValidateInput(schema, [
        { label: "No ID" }
      ]);
      expect(invalidResult.ok).toBe(false);
    });

    it("should handle empty objects", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");
      const schema = { type: "object" };
      
      const result = safeValidateInput(schema, {});
      expect(result.ok).toBe(true);
    });

    it("should handle empty arrays", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");
      const schema = { 
        type: "array",
        items: { type: "string" }
      };
      
      const result = safeValidateInput(schema, []);
      expect(result.ok).toBe(true);
    });

    it("should return error issues on validation failure", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");
      const schema = {
        type: "object",
        properties: {
          count: { type: "number" }
        }
      };
      
      const result = safeValidateInput(schema, { count: "not a number" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.issues).toBeDefined();
        expect(result.error.issues.length).toBeGreaterThan(0);
        expect(result.error.issues[0]).toHaveProperty("path");
        expect(result.error.issues[0]).toHaveProperty("message");
        expect(result.error.issues[0]).toHaveProperty("code");
      }
    });
  });

  describe("safeValidateOutput", () => {
    it("should validate output same as input", async () => {
      const { safeValidateOutput } = await import("../../backend/tools/validation.js");
      const schema = { type: "string" };
      
      const result = safeValidateOutput(schema, "output data");
      expect(result.ok).toBe(true);
    });

    it("should reject invalid output", async () => {
      const { safeValidateOutput } = await import("../../backend/tools/validation.js");
      const schema = { type: "number" };
      
      const result = safeValidateOutput(schema, "not a number");
      expect(result.ok).toBe(false);
    });
  });

  describe("formatValidationError", () => {
    it("should format single error", async () => {
      const { safeValidateInput, formatValidationError } = await import("../../backend/tools/validation.js");
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" }
        },
        required: ["name"]
      };
      
      const result = safeValidateInput(schema, {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const formatted = formatValidationError(result);
        expect(formatted).toContain("name");
        expect(formatted).toContain("Required");
      }
    });

    it("should format multiple errors", async () => {
      const { safeValidateInput, formatValidationError } = await import("../../backend/tools/validation.js");
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" }
        },
        required: ["name", "age"]
      };
      
      const result = safeValidateInput(schema, {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const formatted = formatValidationError(result);
        expect(formatted).toContain("name");
        expect(formatted).toContain("age");
      }
    });

    it("should format nested path errors", async () => {
      const { safeValidateInput, formatValidationError } = await import("../../backend/tools/validation.js");
      const schema = {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              profile: {
                type: "object",
                properties: {
                  email: { type: "string" }
                },
                required: ["email"]
              }
            },
            required: ["profile"]
          }
        }
      };
      
      const result = safeValidateInput(schema, { user: { profile: {} } });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const formatted = formatValidationError(result);
        expect(formatted).toContain("user");
        expect(formatted).toContain("profile");
        expect(formatted).toContain("email");
      }
    });

    it("should format array index errors", async () => {
      const { safeValidateInput, formatValidationError } = await import("../../backend/tools/validation.js");
      const schema = {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "number" }
          },
          required: ["id"]
        }
      };
      
      const result = safeValidateInput(schema, [{}, { id: 1 }]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        const formatted = formatValidationError(result);
        expect(formatted).toContain("0");
        expect(formatted).toContain("id");
      }
    });
  });

  describe("isZodSchema", () => {
    it("should detect Zod schema", async () => {
      const { isZodSchema } = await import("../../backend/tools/validation.js");
      const { z } = await import("zod");
      
      const zodSchema = z.string();
      expect(isZodSchema(zodSchema)).toBe(true);
    });

    it("should reject non-Zod schema", async () => {
      const { isZodSchema } = await import("../../backend/tools/validation.js");
      
      const jsonSchema = { type: "string" };
      expect(isZodSchema(jsonSchema)).toBe(false);
      
      expect(isZodSchema(null)).toBe(false);
      expect(isZodSchema(undefined)).toBe(false);
      expect(isZodSchema("string")).toBe(false);
      expect(isZodSchema(123)).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should handle deeply nested schemas", async () => {
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
                  level3: {
                    type: "object",
                    properties: {
                      value: { type: "string" }
                    }
                  }
                }
              }
            }
          }
        }
      };
      
      const validResult = safeValidateInput(schema, {
        level1: {
          level2: {
            level3: {
              value: "deep"
            }
          }
        }
      });
      expect(validResult.ok).toBe(true);
    });

    it("should handle mixed type arrays", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");
      const schema = {
        type: "array",
        items: { type: "string" }
      };
      
      const result = safeValidateInput(schema, ["a", 1, true, null]);
      expect(result.ok).toBe(false);
    });

    it("should handle null input", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");
      const schema = { type: "string" };
      
      const result = safeValidateInput(schema, null);
      expect(result.ok).toBe(false);
    });

    it("should handle undefined input", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");
      const schema = { type: "string" };
      
      const result = safeValidateInput(schema, undefined);
      expect(result.ok).toBe(false);
    });

    it("should handle extra properties in object", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" }
        }
      };
      
      const result = safeValidateInput(schema, { name: "John", extra: "value" });
      expect(result.ok).toBe(true);
    });

    it("should handle unknown schema types gracefully", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");
      const schema = { type: "unknown" };
      
      const result = safeValidateInput(schema, "anything");
      expect(result.ok).toBe(true);
    });

    it("should handle schema without type", async () => {
      const { safeValidateInput } = await import("../../backend/tools/validation.js");
      const schema = {};
      
      const result = safeValidateInput(schema, { any: "data" });
      expect(result.ok).toBe(true);
    });
  });
});
