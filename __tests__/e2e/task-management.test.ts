import { describe, it, expect, beforeAll } from "bun:test";
import { initializeSystemServices, getSystemServices } from "../../backend/integration/index.js";
import type { SystemServices } from "../../backend/integration/index.js";

describe("E2E: Task Management Flow", () => {
  let services: SystemServices;

  beforeAll(async () => {
    services = await initializeSystemServices();
  }, 30000);

  describe("Task State Machine", () => {
    it("should have task state machine initialized", () => {
      expect(services.taskStateMachine).toBeDefined();
    });

    it("should create a new task", async () => {
      const task = services.taskStateMachine.createTask({
        id: `test-task-${Date.now()}`,
        name: "Test Task",
        description: "A test task for E2E",
      });

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.state).toBe("queued");
    });

    it("should transition task state", async () => {
      const task = services.taskStateMachine.createTask({
        id: `state-transition-test-${Date.now()}`,
        name: "State Transition Test",
        description: "Testing state transitions",
      });

      services.taskStateMachine.transition(task.id, "running", "user");
      
      const updated = services.taskStateMachine.getTask(task.id);
      expect(updated?.state).toBe("running");
    });

    it("should get task by id", async () => {
      const task = services.taskStateMachine.createTask({
        id: `get-task-test-${Date.now()}`,
        name: "Get Task Test",
      });

      const retrieved = services.taskStateMachine.getTask(task.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(task.id);
    });
  });

  describe("Progress Tracker", () => {
    it("should have progress tracker initialized", () => {
      expect(services.progressTracker).toBeDefined();
    });

    it("should track progress", async () => {
      const taskId = `test-progress-${Date.now()}`;
      
      services.progressTracker.start(taskId, 100);
      services.progressTracker.update({
        progress: 50,
        currentStep: "Processing",
      });
      
      const progress = services.progressTracker.getProgress();
      expect(progress).toBeDefined();
      expect(progress?.progress).toBe(50);
    });

    it("should complete progress tracking", async () => {
      const taskId = `complete-progress-${Date.now()}`;
      
      services.progressTracker.start(taskId);
      services.progressTracker.complete(["artifact1", "artifact2"]);
      
      const progress = services.progressTracker.getProgress();
      expect(progress?.progress).toBe(100);
    });
  });

  describe("Multi-Task Progress Tracker", () => {
    it("should have multi-task tracker initialized", () => {
      expect(services.multiTaskTracker).toBeDefined();
    });
  });
});
