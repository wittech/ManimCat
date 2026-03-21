import type { StudioAgentType, StudioToolDefinition } from '../domain/types'

export class StudioToolRegistry {
  private readonly tools = new Map<string, StudioToolDefinition>()

  register(tool: StudioToolDefinition): void {
    this.tools.set(tool.name, tool)
  }

  get(toolName: string): StudioToolDefinition | null {
    return this.tools.get(toolName) ?? null
  }

  list(): StudioToolDefinition[] {
    return [...this.tools.values()]
  }

  listForAgent(agentType: StudioAgentType): StudioToolDefinition[] {
    return this.list().filter((tool) => tool.allowedAgents.includes(agentType))
  }
}

