export type OpenAITransportEvent =
  | { type: "status"; message: string }
  | { type: "assistant_text"; delta: string }
  | { type: "tool_call"; toolKey: string };

export class OpenAITransportBuffer {
  private events: OpenAITransportEvent[] = [];

  push(event: OpenAITransportEvent) {
    this.events.push(event);
  }

  list() {
    return this.events.slice();
  }
}
