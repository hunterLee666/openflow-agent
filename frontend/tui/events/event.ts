import { z } from "zod";

export const EventSchema = z.object({
  bubbles: z.boolean().default(true),
  cancelable: z.boolean().default(true),
  stopImmediatePropagationFlag: z.boolean().default(false),
});
export type Event = z.infer<typeof EventSchema>;

export class BaseEvent implements Event {
  bubbles: boolean;
  cancelable: boolean;
  stopImmediatePropagationFlag: boolean;

  constructor(type: string, init: EventInit = {}) {
    this.bubbles = init.bubbles ?? true;
    this.cancelable = init.cancelable ?? true;
    this.stopImmediatePropagationFlag = false;
  }

  stopImmediatePropagation(): void {
    this.stopImmediatePropagationFlag = true;
  }

  didStopImmediatePropagation(): boolean {
    return this.stopImmediatePropagationFlag;
  }
}

export type TerminalEvent = BaseEvent;