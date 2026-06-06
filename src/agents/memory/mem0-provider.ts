import {
  MemorySearchResult,
  MemoryWriteResult,
} from "@/src/agents/core/agent-types";
import {
  MemoryProvider,
  MemoryProviderContext,
} from "@/src/agents/memory/memory-provider";

function buildDegradedResult(summary: string): MemorySearchResult {
  return {
    summary,
    items: [],
    degraded: true,
  };
}

async function safeJson(response: Response) {
  return response.json().catch(() => null);
}

type Mem0Item = {
  id?: unknown;
  content?: unknown;
  score?: unknown;
};

// This adapter isolates Mem0 behind a single interface so the app can run before the
// concrete local Mem0 deployment contract is finalized.
export class Mem0MemoryProvider implements MemoryProvider {
  private readonly baseUrl = process.env.MEM0_BASE_URL?.trim() || "";
  private readonly apiKey = process.env.MEM0_API_KEY?.trim() || "";

  private hasConfig() {
    return this.baseUrl.length > 0;
  }

  private buildHeaders() {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }

    return headers;
  }

  private buildEntityIds(context: MemoryProviderContext) {
    return {
      user_id: context.namespace || `pinna:${context.pinnaId}`,
      agent_id: `thread:${context.threadId}`,
      run_id: `note:${context.noteId}`,
    };
  }

  private async deleteMemoriesByUserId(userId: string) {
    const url = new URL(`${this.baseUrl}/memories`);
    url.searchParams.set("user_id", userId);

    const response = await fetch(url, {
      method: "DELETE",
      headers: this.buildHeaders(),
    });

    return {
      ok: response.ok,
      status: response.status,
      payload: await safeJson(response),
    };
  }

  async searchContext(input: {
    context: MemoryProviderContext;
    query: string;
  }): Promise<MemorySearchResult> {
    if (!this.hasConfig()) {
      return buildDegradedResult("Mem0 is not configured. Running without isolated memory.");
    }

    try {
      const response = await fetch(`${this.baseUrl}/search`, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify({
          query: input.query,
          ...this.buildEntityIds(input.context),
        }),
      });

      if (!response.ok) {
        return buildDegradedResult(`Mem0 search failed with status ${response.status}.`);
      }

      const payload = await safeJson(response);
      const items: Mem0Item[] = Array.isArray(payload?.results)
        ? payload.results
        : Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload?.memories)
            ? payload.memories
            : [];

      return {
        summary:
          typeof payload?.summary === "string" && payload.summary.trim().length > 0
            ? payload.summary
            : items
                .map((item) =>
                  typeof item.content === "string" ? item.content : "",
                )
                .filter(Boolean)
                .slice(0, 5)
                .join("\n"),
        items: items
          .map((item) => ({
            id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
            content: typeof item.content === "string" ? item.content : "",
            score: typeof item.score === "number" ? item.score : undefined,
          }))
          .filter((item) => item.content.length > 0),
        degraded: false,
      };
    } catch (error) {
      return buildDegradedResult(
        error instanceof Error ? error.message : "Mem0 search failed.",
      );
    }
  }

  async appendTurn(input: {
    context: MemoryProviderContext;
    userMessage: string;
    assistantMessage: string;
  }): Promise<MemoryWriteResult> {
    if (!this.hasConfig()) {
      return {
        ok: false,
        operation: "appendTurn",
        degraded: true,
        detail: "Mem0 is not configured.",
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/memories`, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify({
          ...this.buildEntityIds(input.context),
          messages: [
            {
              role: "user",
              content: input.userMessage,
            },
            {
              role: "assistant",
              content: input.assistantMessage,
            },
          ],
        }),
      });

      if (!response.ok) {
        return {
          ok: false,
          operation: "appendTurn",
          degraded: true,
          detail: `Mem0 append failed with status ${response.status}.`,
        };
      }

      return {
        ok: true,
        operation: "appendTurn",
        degraded: false,
      };
    } catch (error) {
      return {
        ok: false,
        operation: "appendTurn",
        degraded: true,
        detail: error instanceof Error ? error.message : "Mem0 append failed.",
      };
    }
  }

  async getSnapshot(input: {
    context: MemoryProviderContext;
  }): Promise<MemorySearchResult> {
    return this.searchContext({
      context: input.context,
      query: "latest pinna memory snapshot",
    });
  }

  async deleteContexts(input: {
    contexts: MemoryProviderContext[];
  }): Promise<MemoryWriteResult> {
    if (!this.hasConfig()) {
      return {
        ok: false,
        operation: "deleteContexts",
        degraded: true,
        detail: "Mem0 is not configured.",
      };
    }

    const uniqueContexts = input.contexts.filter(
      (context, index, all) =>
        all.findIndex(
          (entry) =>
            entry.namespace === context.namespace &&
            entry.threadId === context.threadId &&
            entry.noteId === context.noteId,
        ) === index,
    );

    try {
      for (const context of uniqueContexts) {
        const userId = context.namespace || `pinna:${context.pinnaId}`;
        const deleteResult = await this.deleteMemoriesByUserId(userId);

        if (deleteResult.ok) {
          console.info(`Mem0 deleted for this pinna: ${userId}`);
          continue;
        }

        console.error(`Mem0 delete failed for this pinna: ${userId}`, {
          status: deleteResult.status,
          payload: deleteResult.payload,
        });

        if (!deleteResult.ok) {
          return {
            ok: false,
            operation: "deleteContexts",
            degraded: true,
            detail: `Mem0 delete failed for ${userId} with status ${deleteResult.status}.`,
          };
        }
      }

      return {
        ok: true,
        operation: "deleteContexts",
        degraded: false,
      };
    } catch (error) {
      return {
        ok: false,
        operation: "deleteContexts",
        degraded: true,
        detail: error instanceof Error ? error.message : "Mem0 delete failed.",
      };
    }
  }
}
