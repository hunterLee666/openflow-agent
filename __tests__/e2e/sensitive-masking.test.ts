import { describe, it, expect } from "vitest";

describe("E2E: Sensitive Data Masking Flow", () => {
  describe("isSensitiveField", () => {
    it("should detect password fields", async () => {
      const { isSensitiveField } = await import("../../backend/tools/masking.js");
      
      expect(isSensitiveField("password")).toBe(true);
      expect(isSensitiveField("PASSWORD")).toBe(true);
      expect(isSensitiveField("Password")).toBe(true);
      expect(isSensitiveField("passwd")).toBe(true);
      expect(isSensitiveField("pwd")).toBe(true);
    });

    it("should detect API key fields", async () => {
      const { isSensitiveField } = await import("../../backend/tools/masking.js");
      
      expect(isSensitiveField("api_key")).toBe(true);
      expect(isSensitiveField("apiKey")).toBe(true);
      expect(isSensitiveField("api-key")).toBe(true);
      expect(isSensitiveField("API_KEY")).toBe(true);
    });

    it("should detect token fields", async () => {
      const { isSensitiveField } = await import("../../backend/tools/masking.js");
      
      expect(isSensitiveField("access_token")).toBe(true);
      expect(isSensitiveField("accessToken")).toBe(true);
      expect(isSensitiveField("refresh_token")).toBe(true);
      expect(isSensitiveField("bearer")).toBe(true);
      expect(isSensitiveField("authorization")).toBe(true);
    });

    it("should detect secret fields", async () => {
      const { isSensitiveField } = await import("../../backend/tools/masking.js");
      
      expect(isSensitiveField("secret")).toBe(true);
      expect(isSensitiveField("SECRET")).toBe(true);
      expect(isSensitiveField("api_secret")).toBe(true);
      expect(isSensitiveField("credential")).toBe(true);
    });

    it("should detect private key fields", async () => {
      const { isSensitiveField } = await import("../../backend/tools/masking.js");
      
      expect(isSensitiveField("private_key")).toBe(true);
      expect(isSensitiveField("privateKey")).toBe(true);
      expect(isSensitiveField("PRIVATE_KEY")).toBe(true);
    });

    it("should detect session fields", async () => {
      const { isSensitiveField } = await import("../../backend/tools/masking.js");
      
      expect(isSensitiveField("session_id")).toBe(true);
      expect(isSensitiveField("sessionId")).toBe(true);
    });

    it("should detect custom header fields", async () => {
      const { isSensitiveField } = await import("../../backend/tools/masking.js");
      
      expect(isSensitiveField("x-api-key")).toBe(true);
      expect(isSensitiveField("x-auth-token")).toBe(true);
      expect(isSensitiveField("X-API-KEY")).toBe(true);
    });

    it("should not detect non-sensitive fields", async () => {
      const { isSensitiveField } = await import("../../backend/tools/masking.js");
      
      expect(isSensitiveField("name")).toBe(false);
      expect(isSensitiveField("email")).toBe(false);
      expect(isSensitiveField("username")).toBe(false);
      expect(isSensitiveField("description")).toBe(false);
      expect(isSensitiveField("count")).toBe(false);
    });
  });

  describe("isSensitiveValue", () => {
    it("should detect private keys", async () => {
      const { isSensitiveValue } = await import("../../backend/tools/masking.js");
      
      const rsaKey = "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----";
      expect(isSensitiveValue(rsaKey)).toBe(true);
      
      const openSSHKey = "-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----";
      expect(isSensitiveValue(openSSHKey)).toBe(true);
    });

    it("should detect JWT tokens", async () => {
      const { isSensitiveValue } = await import("../../backend/tools/masking.js");
      
      const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
      expect(isSensitiveValue(jwt)).toBe(true);
    });

    it("should detect GitHub tokens", async () => {
      const { isSensitiveValue } = await import("../../backend/tools/masking.js");
      
      expect(isSensitiveValue("ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")).toBe(true);
      expect(isSensitiveValue("gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")).toBe(true);
      expect(isSensitiveValue("ghu_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")).toBe(true);
      expect(isSensitiveValue("ghs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")).toBe(true);
      expect(isSensitiveValue("ghr_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")).toBe(true);
    });

    it("should detect OpenAI API keys", async () => {
      const { isSensitiveValue } = await import("../../backend/tools/masking.js");
      
      expect(isSensitiveValue("sk-xxxxxxxxxxxxxxxxxxxx")).toBe(true);
      expect(isSensitiveValue("sk-proj-xxxxxxxxxxxxxxxxxxxx")).toBe(true);
    });

    it("should detect Stripe keys", async () => {
      const { isSensitiveValue } = await import("../../backend/tools/masking.js");
      
      expect(isSensitiveValue("sk_live_xxxxxxxxxxxxxxxxxxxx")).toBe(true);
    });

    it("should detect AWS access keys", async () => {
      const { isSensitiveValue } = await import("../../backend/tools/masking.js");
      
      expect(isSensitiveValue("AKIAIOSFODNN7EXAMPLE")).toBe(true);
    });

    it("should not detect non-sensitive values", async () => {
      const { isSensitiveValue } = await import("../../backend/tools/masking.js");
      
      expect(isSensitiveValue("hello world")).toBe(false);
      expect(isSensitiveValue("user@example.com")).toBe(false);
      expect(isSensitiveValue("12345")).toBe(false);
      expect(isSensitiveValue("normal-text-string")).toBe(false);
    });

    it("should handle non-string values", async () => {
      const { isSensitiveValue } = await import("../../backend/tools/masking.js");
      
      expect(isSensitiveValue(123)).toBe(false);
      expect(isSensitiveValue(true)).toBe(false);
      expect(isSensitiveValue(null)).toBe(false);
      expect(isSensitiveValue(undefined)).toBe(false);
      expect(isSensitiveValue({})).toBe(false);
      expect(isSensitiveValue([])).toBe(false);
    });
  });

  describe("maskValue", () => {
    it("should mask sensitive strings", async () => {
      const { maskValue } = await import("../../backend/tools/masking.js");
      
      const result = maskValue("sk-xxxxxxxxxxxxxxxxxxxx");
      expect(result).toBe("[REDACTED]");
    });

    it("should mask sensitive objects", async () => {
      const { maskValue } = await import("../../backend/tools/masking.js");
      
      const obj = {
        username: "john",
        password: "secret123",
        email: "john@example.com",
      };
      
      const result = maskValue(obj) as Record<string, unknown>;
      
      expect(result.username).toBe("john");
      expect(result.password).toBe("[REDACTED]");
      expect(result.email).toBe("john@example.com");
    });

    it("should mask nested objects", async () => {
      const { maskValue } = await import("../../backend/tools/masking.js");
      
      const obj = {
        user: {
          name: "john",
          credentials: {
            api_key: "sk-xxxx",
          },
        },
      };
      
      const result = maskValue(obj) as Record<string, unknown>;
      const user = result.user as Record<string, unknown>;
      const credentials = user.credentials as Record<string, unknown>;
      
      expect(credentials.api_key).toBe("[REDACTED]");
    });

    it("should mask arrays", async () => {
      const { maskValue } = await import("../../backend/tools/masking.js");
      
      const arr = [
        { name: "item1", secret: "value1" },
        { name: "item2", secret: "value2" },
      ];
      
      const result = maskValue(arr) as Array<Record<string, unknown>>;
      
      expect(result[0].secret).toBe("[REDACTED]");
      expect(result[1].secret).toBe("[REDACTED]");
    });

    it("should use custom replacement", async () => {
      const { maskValue } = await import("../../backend/tools/masking.js");
      
      const result = maskValue("sk-xxxxxxxxxxxxxxxxxxxx", { replaceWith: "***MASKED***" });
      expect(result).toBe("***MASKED***");
    });

    it("should mask entire value when maskEntire is true", async () => {
      const { maskValue } = await import("../../backend/tools/masking.js");
      
      const result = maskValue("any text", { maskEntire: true });
      expect(result).toBe("[REDACTED]");
    });

    it("should pass through non-sensitive values", async () => {
      const { maskValue } = await import("../../backend/tools/masking.js");
      
      expect(maskValue("hello world")).toBe("hello world");
      expect(maskValue(123)).toBe(123);
      expect(maskValue(true)).toBe(true);
      expect(maskValue(null)).toBe(null);
    });
  });

  describe("maskObject", () => {
    it("should mask all sensitive fields in object", async () => {
      const { maskObject } = await import("../../backend/tools/masking.js");
      
      const obj = {
        username: "john",
        password: "secret",
        api_key: "sk-xxxx",
        email: "john@example.com",
        token: "bearer-token",
      };
      
      const result = maskObject(obj);
      
      expect(result.username).toBe("john");
      expect(result.password).toBe("[REDACTED]");
      expect(result.api_key).toBe("[REDACTED]");
      expect(result.email).toBe("john@example.com");
      expect(result.token).toBe("[REDACTED]");
    });

    it("should handle empty object", async () => {
      const { maskObject } = await import("../../backend/tools/masking.js");
      
      const result = maskObject({});
      expect(result).toEqual({});
    });

    it("should handle object with no sensitive fields", async () => {
      const { maskObject } = await import("../../backend/tools/masking.js");
      
      const obj = {
        name: "test",
        count: 42,
        active: true,
      };
      
      const result = maskObject(obj);
      
      expect(result).toEqual(obj);
    });

    it("should use custom replacement", async () => {
      const { maskObject } = await import("../../backend/tools/masking.js");
      
      const obj = { password: "secret" };
      const result = maskObject(obj, { replaceWith: "***HIDDEN***" });
      
      expect(result.password).toBe("***HIDDEN***");
    });
  });

  describe("maskSensitiveString", () => {
    it("should mask password patterns", async () => {
      const { maskSensitiveString } = await import("../../backend/tools/masking.js");
      
      const text = "password=secret123 api_key=sk-xxxx";
      const result = maskSensitiveString(text);
      
      expect(result).toContain("password=");
      expect(result).toContain("api_key=");
    });

    it("should mask private keys in text", async () => {
      const { maskSensitiveString } = await import("../../backend/tools/masking.js");
      
      const text = "Here is my key: -----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----";
      const result = maskSensitiveString(text);
      
      expect(result).toContain("[PRIVATE KEY REDACTED]");
    });

    it("should mask API keys in text", async () => {
      const { maskSensitiveString } = await import("../../backend/tools/masking.js");
      
      const text = "Use this key: sk-xxxxxxxxxxxxxxxxxxxx for API calls";
      const result = maskSensitiveString(text);
      
      expect(result).toContain("[API KEY REDACTED]");
      expect(result).not.toContain("sk-xxxxxxxxxxxxxxxxxxxx");
    });

    it("should mask GitHub tokens in text", async () => {
      const { maskSensitiveString } = await import("../../backend/tools/masking.js");
      
      const text = "Token: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
      const result = maskSensitiveString(text);
      
      expect(result).toContain("[GITHUB TOKEN REDACTED]");
    });

    it("should mask JWT tokens in text", async () => {
      const { maskSensitiveString } = await import("../../backend/tools/masking.js");
      
      const text = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
      const result = maskSensitiveString(text);
      
      expect(result).toContain("[JWT REDACTED]");
    });

    it("should handle text with no sensitive data", async () => {
      const { maskSensitiveString } = await import("../../backend/tools/masking.js");
      
      const text = "This is a normal text without any sensitive data";
      const result = maskSensitiveString(text);
      
      expect(result).toBe(text);
    });
  });

  describe("maskCommandOutput", () => {
    it("should mask string output", async () => {
      const { maskCommandOutput } = await import("../../backend/tools/masking.js");
      
      const output = "password=secret123";
      const result = maskCommandOutput(output) as string;
      
      expect(result).toContain("[REDACTED]");
    });

    it("should mask object output", async () => {
      const { maskCommandOutput } = await import("../../backend/tools/masking.js");
      
      const output = {
        status: "success",
        credentials: {
          api_key: "sk-xxxx",
        },
      };
      
      const result = maskCommandOutput(output) as Record<string, unknown>;
      const credentials = result.credentials as Record<string, unknown>;
      
      expect(result.status).toBe("success");
      expect(credentials.api_key).toBe("[REDACTED]");
    });

    it("should mask array output", async () => {
      const { maskCommandOutput } = await import("../../backend/tools/masking.js");
      
      const output = [
        { name: "item1", secret: "value1" },
      ];
      
      const result = maskCommandOutput(output) as Array<Record<string, unknown>>;
      
      expect(result[0].secret).toBe("[REDACTED]");
    });

    it("should pass through non-object values", async () => {
      const { maskCommandOutput } = await import("../../backend/tools/masking.js");
      
      expect(maskCommandOutput(123)).toBe(123);
      expect(maskCommandOutput(true)).toBe(true);
      expect(maskCommandOutput(null)).toBe(null);
    });
  });

  describe("createMaskingHook", () => {
    it("should create masking hook", async () => {
      const { createMaskingHook } = await import("../../backend/tools/masking.js");
      
      const hook = createMaskingHook();
      
      expect(hook.name).toBe("sensitive-field-masking");
      expect(hook.postToolUse).toBeDefined();
    });

    it("should mask output in postToolUse", async () => {
      const { createMaskingHook } = await import("../../backend/tools/masking.js");
      
      const hook = createMaskingHook();
      const result = await hook.postToolUse({
        output: {
          status: "ok",
          password: "secret123",
        },
      });
      
      const output = result.output as Record<string, unknown>;
      expect(output.status).toBe("ok");
      expect(output.password).toBe("[REDACTED]");
    });

    it("should handle undefined output", async () => {
      const { createMaskingHook } = await import("../../backend/tools/masking.js");
      
      const hook = createMaskingHook();
      const result = await hook.postToolUse({});
      
      expect(result).toEqual({});
    });
  });

  describe("Edge Cases", () => {
    it("should handle deeply nested sensitive data", async () => {
      const { maskValue } = await import("../../backend/tools/masking.js");
      
      const obj = {
        level1: {
          level2: {
            level3: {
              level4: {
                secret: "hidden",
              },
            },
          },
        },
      };
      
      const result = maskValue(obj) as Record<string, unknown>;
      const level1 = result.level1 as Record<string, unknown>;
      const level2 = level1.level2 as Record<string, unknown>;
      const level3 = level2.level3 as Record<string, unknown>;
      const level4 = level3.level4 as Record<string, unknown>;
      
      expect(level4.secret).toBe("[REDACTED]");
    });

    it("should handle circular references gracefully", async () => {
      const { maskValue } = await import("../../backend/tools/masking.js");
      
      const obj: Record<string, unknown> = { name: "test" };
      obj.self = obj;
      
      expect(() => maskValue(obj)).not.toThrow();
    });

    it("should handle arrays of sensitive values", async () => {
      const { maskValue } = await import("../../backend/tools/masking.js");
      
      const arr = [
        "sk-xxxxxxxxxxxxxxxxxxxx",
        "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        "normal text",
      ];
      
      const result = maskValue(arr) as string[];
      
      expect(result[0]).toBe("[REDACTED]");
      expect(result[1]).toBe("[REDACTED]");
      expect(result[2]).toBe("normal text");
    });

    it("should handle mixed array types", async () => {
      const { maskValue } = await import("../../backend/tools/masking.js");
      
      const arr = [
        "string",
        123,
        true,
        { password: "secret" },
        null,
      ];
      
      const result = maskValue(arr) as unknown[];
      
      expect(result[0]).toBe("string");
      expect(result[1]).toBe(123);
      expect(result[2]).toBe(true);
      expect((result[3] as Record<string, unknown>).password).toBe("[REDACTED]");
      expect(result[4]).toBe(null);
    });
  });
});
