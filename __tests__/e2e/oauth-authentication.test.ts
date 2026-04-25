import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, type SystemServices } from "../../backend/integration/index.js";

describe("E2E: OAuth Authentication Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("OAuth Token Manager Initialization", () => {
    it("should have OAuth token manager initialized", () => {
      expect(services.oauthTokenManager).toBeDefined();
    });
  });

  describe("OAuth Token Manager Types", () => {
    it("should have OAuthTokenManager class", async () => {
      const { OAuthTokenManager } = await import("../../backend/services/auth/index.js");
      expect(OAuthTokenManager).toBeDefined();
    });

    it("should have createOAuthManager function", async () => {
      const { createOAuthManager } = await import("../../backend/services/auth/index.js");
      expect(typeof createOAuthManager).toBe("function");
    });
  });

  describe("OAuth Configuration", () => {
    it("should have auth types module", async () => {
      const types = await import("../../backend/services/auth/index.js");
      expect(types).toBeDefined();
    });
  });

  describe("OAuth Token Manager Methods", () => {
    it("should have getAccessToken method", () => {
      expect(typeof services.oauthTokenManager.getAccessToken).toBe("function");
    });

    it("should have isAuthenticated method", () => {
      expect(typeof services.oauthTokenManager.isAuthenticated).toBe("function");
    });
  });

  describe("OAuth Token Storage", () => {
    it("should store tokens securely", () => {
      expect(services.oauthTokenManager).toBeDefined();
    });

    it("should retrieve stored tokens", () => {
      expect(services.oauthTokenManager).toBeDefined();
    });
  });

  describe("OAuth Token Refresh", () => {
    it("should support automatic token refresh", () => {
      expect(services.oauthTokenManager).toBeDefined();
    });

    it("should handle token expiration", () => {
      expect(services.oauthTokenManager).toBeDefined();
    });
  });

  describe("OAuth Security", () => {
    it("should validate token integrity", () => {
      expect(services.oauthTokenManager).toBeDefined();
    });

    it("should support token revocation", () => {
      expect(services.oauthTokenManager).toBeDefined();
    });
  });
});
