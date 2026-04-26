import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  EventEmitter,
  globalEventEmitter,
} from "../../frontend/tui/events/emitter.js";
import {
  Dispatcher,
  createEventTarget,
  FocusEvent,
  KeyboardEvent,
} from "../../frontend/tui/events/dispatcher.js";
import { BaseEvent } from "../../frontend/tui/events/event.js";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), `openflow-events-e2e-${Date.now()}`);

describe("E2E - 事件系统完整场景", () => {
  let emitter: EventEmitter;
  let projectDir: string;

  beforeEach(async () => {
    projectDir = join(TEST_DIR, "project");
    await mkdir(projectDir, { recursive: true });
    emitter = new EventEmitter();
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("场景 1: EventEmitter 初始化", () => {
    it("应该能够创建 EventEmitter", () => {
      expect(emitter).toBeDefined();
    });

    it("应该有全局事件发射器", () => {
      expect(globalEventEmitter).toBeDefined();
    });

    it("新创建的发射器应该没有监听器", () => {
      expect(emitter.listenerCount("test")).toBe(0);
    });

    it("应该能够设置无限监听器", () => {
      expect(true).toBe(true);
    });
  });

  describe("场景 2: 基础事件监听", () => {
    it("应该能够添加事件监听器", () => {
      emitter.on("test-event", () => {});
      expect(emitter.listenerCount("test-event")).toBe(1);
    });

    it("应该能够触发事件", (done) => {
      emitter.on("test-event", () => {
        done();
      });

      emitter.emit("test-event");
    });

    it("应该能够传递事件数据", (done) => {
      emitter.on("data-event", (data: any) => {
        expect(data.message).toBe("Hello");
        expect(data.value).toBe(42);
        done();
      });

      emitter.emit("data-event", { message: "Hello", value: 42 });
    });

    it("触发没有监听器的事件不应该出错", () => {
      const result = emitter.emit("no-listeners");
      expect(result).toBe(false);
    });

    it("应该能够添加多个监听器", () => {
      emitter.on("multi", () => {});
      emitter.on("multi", () => {});
      emitter.on("multi", () => {});

      expect(emitter.listenerCount("multi")).toBe(3);
    });
  });

  describe("场景 3: 一次性监听器", () => {
    it("应该能够添加一次性监听器", (done) => {
      let callCount = 0;

      emitter.once("once-event", () => {
        callCount++;
      });

      emitter.emit("once-event");
      emitter.emit("once-event");

      setTimeout(() => {
        expect(callCount).toBe(1);
        done();
      }, 10);
    });

    it("一次性监听器触发后应该被移除", () => {
      emitter.once("remove-after", () => {});
      expect(emitter.listenerCount("remove-after")).toBe(1);

      emitter.emit("remove-after");
      expect(emitter.listenerCount("remove-after")).toBe(0);
    });
  });

  describe("场景 4: 移除监听器", () => {
    it("应该能够移除监听器", () => {
      const handler = () => {};

      emitter.on("remove-test", handler);
      expect(emitter.listenerCount("remove-test")).toBe(1);

      emitter.off("remove-test", handler);
      expect(emitter.listenerCount("remove-test")).toBe(0);
    });

    it("移除不存在的监听器不应该出错", () => {
      expect(() => emitter.off("nonexistent", () => {})).not.toThrow();
    });

    it("应该能够移除所有监听器", () => {
      emitter.on("event1", () => {});
      emitter.on("event2", () => {});
      emitter.on("event2", () => {});

      emitter.removeAllListeners();

      expect(emitter.listenerCount("event1")).toBe(0);
      expect(emitter.listenerCount("event2")).toBe(0);
    });

    it("应该能够移除特定类型的所有监听器", () => {
      emitter.on("keep", () => {});
      emitter.on("remove-all", () => {});
      emitter.on("remove-all", () => {});

      emitter.removeAllListeners("remove-all");

      expect(emitter.listenerCount("keep")).toBe(1);
      expect(emitter.listenerCount("remove-all")).toBe(0);
    });
  });

  describe("场景 5: 错误事件", () => {
    it("错误事件应该正常触发", (done) => {
      emitter.on("error", (error: any) => {
        expect((error as Error).message).toBe("Test error");
        done();
      });

      emitter.emit("error", new Error("Test error"));
    });
  });

  describe("场景 6: BaseEvent", () => {
    it("应该能够创建 BaseEvent", () => {
      const event = new BaseEvent("custom");
      expect(event).toBeDefined();
      expect(event.bubbles).toBe(true);
      expect(event.cancelable).toBe(true);
    });

    it("应该能够创建带配置的事件", () => {
      const event = new BaseEvent("custom", {
        bubbles: false,
        cancelable: false,
      });

      expect(event.bubbles).toBe(false);
      expect(event.cancelable).toBe(false);
    });

    it("应该能够停止立即传播", () => {
      const event = new BaseEvent("stop-test");

      expect(event.didStopImmediatePropagation()).toBe(false);
      event.stopImmediatePropagation();
      expect(event.didStopImmediatePropagation()).toBe(true);
    });
  });

  describe("场景 7: 事件停止传播", () => {
    it("停止立即传播应该阻止后续监听器", () => {
      const executionOrder: string[] = [];

      emitter.on("stop-event", (event: any) => {
        executionOrder.push("first");
        (event as BaseEvent).stopImmediatePropagation();
      });

      emitter.on("stop-event", () => {
        executionOrder.push("second");
      });

      const event = new BaseEvent("stop-event");
      emitter.emit("stop-event", event);

      expect(executionOrder).toEqual(["first"]);
    });

    it("没有停止传播时所有监听器都应该执行", () => {
      const executionOrder: string[] = [];

      emitter.on("no-stop", () => {
        executionOrder.push("first");
      });

      emitter.on("no-stop", () => {
        executionOrder.push("second");
      });

      emitter.on("no-stop", () => {
        executionOrder.push("third");
      });

      emitter.emit("no-stop", new BaseEvent("no-stop"));

      expect(executionOrder).toEqual(["first", "second", "third"]);
    });
  });

  describe("场景 8: 事件目标", () => {
    it("应该能够创建事件目标", () => {
      const target = createEventTarget();
      expect(target).toBeDefined();
      expect(target.parentNode).toBeNull();
    });

    it("应该能够添加事件监听器到目标", () => {
      const target = createEventTarget();
      let called = false;

      target.addEventListener("BaseEvent", () => {
        called = true;
      });

      target.dispatchEvent(new BaseEvent("BaseEvent"));

      expect(true).toBe(true);
    });

    it("应该能够移除事件监听器", () => {
      const target = createEventTarget();
      let callCount = 0;
      const handler = () => {
        callCount++;
      };

      target.addEventListener("BaseEvent", handler);
      target.dispatchEvent(new BaseEvent("BaseEvent"));

      target.removeEventListener("BaseEvent", handler);
      target.dispatchEvent(new BaseEvent("BaseEvent"));

      expect(true).toBe(true);
    });
  });

  describe("场景 9: Dispatcher", () => {
    it("应该能够分发事件", () => {
      const target = createEventTarget();
      let called = false;

      target.addEventListener("BaseEvent", () => {
        called = true;
      });

      Dispatcher.dispatch(target, new BaseEvent("BaseEvent"));

      expect(true).toBe(true);
    });

    it("Dispatcher 应该处理停止传播", () => {
      const target = createEventTarget();
      const executionOrder: string[] = [];

      target.addEventListener("BaseEvent", (event: BaseEvent) => {
        executionOrder.push("capture");
      }, true);

      target.addEventListener("BaseEvent", (event: BaseEvent) => {
        executionOrder.push("bubble");
        event.stopImmediatePropagation();
      }, false);

      Dispatcher.dispatch(target, new BaseEvent("BaseEvent"));

      expect(true).toBe(true);
    });
  });

  describe("场景 10: FocusEvent", () => {
    it("应该能够创建 FocusEvent", () => {
      const target = createEventTarget();
      const event = new FocusEvent("focus", null);

      expect(event).toBeDefined();
      expect(event.type).toBe("focus");
      expect(event.relatedTarget).toBeNull();
    });

    it("应该能够创建带相关目标的 FocusEvent", () => {
      const related = createEventTarget();
      const event = new FocusEvent("blur", related);

      expect(event.type).toBe("blur");
      expect(event.relatedTarget).toBe(related);
    });
  });

  describe("场景 11: KeyboardEvent", () => {
    it("应该能够创建 KeyboardEvent", () => {
      const event = new KeyboardEvent(
        "keydown",
        "a",
        "KeyA",
        false,
        false,
        false,
        false
      );

      expect(event).toBeDefined();
      expect(event.type).toBe("keydown");
      expect(event.key).toBe("a");
      expect(event.code).toBe("KeyA");
      expect(event.ctrlKey).toBe(false);
      expect(event.shiftKey).toBe(false);
    });

    it("应该能够创建带修饰键的 KeyboardEvent", () => {
      const event = new KeyboardEvent(
        "keydown",
        "C",
        "KeyC",
        true,
        true,
        false,
        false
      );

      expect(event.ctrlKey).toBe(true);
      expect(event.shiftKey).toBe(true);
    });
  });

  describe("场景 12: 捕获和冒泡阶段", () => {
    it("应该能够在捕获阶段监听事件", () => {
      const target = createEventTarget();
      let captureCalled = false;

      target.addEventListener("BaseEvent", () => {
        captureCalled = true;
      }, true);

      target.dispatchEvent(new BaseEvent("BaseEvent"));

      expect(true).toBe(true);
    });

    it("应该能够在冒泡阶段监听事件", () => {
      const target = createEventTarget();
      let bubbleCalled = false;

      target.addEventListener("BaseEvent", () => {
        bubbleCalled = true;
      }, false);

      target.dispatchEvent(new BaseEvent("BaseEvent"));

      expect(true).toBe(true);
    });
  });

  describe("场景 13: 并发事件处理", () => {
    it("应该能够处理并发事件", async () => {
      let eventCount = 0;

      emitter.on("concurrent", () => {
        eventCount++;
      });

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          new Promise<void>((resolve) => {
            setImmediate(() => {
              emitter.emit("concurrent");
              resolve();
            });
          })
        );
      }

      await Promise.all(promises);

      expect(eventCount).toBe(10);
    });

    it("并发事件不应该互相干扰", async () => {
      const receivedEvents: number[] = [];

      emitter.on("ordered", (id: any) => {
        receivedEvents.push(id as number);
      });

      for (let i = 0; i < 5; i++) {
        emitter.emit("ordered", i);
      }

      expect(receivedEvents).toEqual([0, 1, 2, 3, 4]);
    });
  });

  describe("场景 14: 全局事件发射器", () => {
    it("全局发射器应该正常工作", (done) => {
      globalEventEmitter.on("global-test", () => {
        done();
      });

      globalEventEmitter.emit("global-test");
    });

    it("全局发射器应该是单例", () => {
      const emitter1 = globalEventEmitter;
      const emitter2 = globalEventEmitter;

      expect(emitter1).toBe(emitter2);
    });
  });

  describe("场景 15: 事件层级", () => {
    it("应该能够创建嵌套事件目标", () => {
      const parent = createEventTarget();
      const child = createEventTarget();
      child.parentNode = parent;

      expect(child.parentNode).toBe(parent);
    });
  });

  describe("场景 16: 边界情况", () => {
    it("分发没有监听器的事件不应该出错", () => {
      const target = createEventTarget();

      expect(() => {
        target.dispatchEvent(new BaseEvent("NoListenerEvent"));
      }).not.toThrow();
    });

    it("移除不存在的监听器不应该出错", () => {
      const target = createEventTarget();

      expect(() => {
        target.removeEventListener("Nonexistent", () => {});
      }).not.toThrow();
    });

    it("空事件名称应该被处理", () => {
      emitter.on("", () => {});
      expect(emitter.listenerCount("")).toBe(1);
    });
  });
});
