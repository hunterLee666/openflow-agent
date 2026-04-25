import { describe, test, expect } from "bun:test";
import {
  serializeMessage,
  deserializeMessage,
  serializeMessages,
  deserializeMessages,
  createUserMessage,
  createAssistantMessage,
  createToolResultMessage,
  createSystemMessage,
  messageToText,
  messageToJSON,
  parseMessageFromJSON,
} from "../../../refactored/core/serialization/message-serialization.js";

describe("Message Serialization", () => {
  test("should serialize and deserialize user message", () => {
    const msg = createUserMessage("Hello world");
    const serialized = serializeMessage(msg, "session-1");

    expect(serialized.role).toBe("user");
    expect(serialized.content).toBe("Hello world");
    expect(serialized.sessionId).toBe("session-1");
    expect(serialized.id).toBeDefined();
    expect(serialized.createdAt).toBeDefined();

    const deserialized = deserializeMessage(serialized);
    expect(deserialized.role).toBe("user");
    expect(deserialized.content).toBe("Hello world");
  });

  test("should serialize and deserialize assistant message", () => {
    const msg = createAssistantMessage("I can help with that");
    const serialized = serializeMessage(msg, "session-2");

    expect(serialized.role).toBe("assistant");
    expect(serialized.content).toBe("I can help with that");

    const deserialized = deserializeMessage(serialized);
    expect(deserialized.role).toBe("assistant");
  });

  test("should serialize and deserialize tool result message", () => {
    const msg = createToolResultMessage("tool-1", { result: "success" });
    const serialized = serializeMessage(msg, "session-3");

    expect(serialized.role).toBe("tool");
    expect(serialized.content).toBe('{"result":"success"}');

    const deserialized = deserializeMessage(serialized);
    expect(deserialized.role).toBe("tool");
  });

  test("should serialize and deserialize system message", () => {
    const msg = createSystemMessage("You are a helpful assistant");
    const serialized = serializeMessage(msg, "session-4");

    expect(serialized.role).toBe("system");
    expect(serialized.content).toBe("You are a helpful assistant");

    const deserialized = deserializeMessage(serialized);
    expect(deserialized.role).toBe("system");
  });

  test("should serialize multiple messages", () => {
    const messages = [
      createUserMessage("Hello"),
      createAssistantMessage("Hi there"),
      createUserMessage("How are you?"),
    ];

    const serialized = serializeMessages(messages, "session-5");
    expect(serialized.length).toBe(3);
    expect(serialized[0].role).toBe("user");
    expect(serialized[1].role).toBe("assistant");
    expect(serialized[2].role).toBe("user");

    const deserialized = deserializeMessages(serialized);
    expect(deserialized.length).toBe(3);
  });

  test("should convert message to text", () => {
    const msg = createUserMessage("Hello world");
    const text = messageToText(msg);
    expect(text).toBe("Hello world");
  });

  test("should convert message to JSON and back", () => {
    const msg = createUserMessage("Hello world");
    const json = messageToJSON(msg);
    const parsed = parseMessageFromJSON(json);

    expect(parsed.role).toBe("user");
    expect(parsed.content).toBe("Hello world");
  });

  test("should handle complex content blocks", () => {
    const msg = {
      role: "assistant" as const,
      content: [
        { type: "text", text: "Let me help" },
        { type: "tool_use", id: "tool-1", name: "read", input: { path: "/tmp/test.txt" } },
      ],
    };

    const serialized = serializeMessage(msg, "session-6");
    expect(Array.isArray(serialized.content)).toBe(true);

    const deserialized = deserializeMessage(serialized);
    expect(Array.isArray(deserialized.content)).toBe(true);
  });
});
