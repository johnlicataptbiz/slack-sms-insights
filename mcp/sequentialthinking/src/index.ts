#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

// Sequential Thinking MCP Server Implementation
// This server provides a tool for dynamic and reflective problem-solving through a structured thinking process

class SequentialThinkingServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'sequential-thinking',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'sequential_thinking',
          description: 'Facilitates a detailed, step-by-step thinking process for problem-solving and analysis',
          inputSchema: {
            type: 'object',
            properties: {
              thought: {
                type: 'string',
                description: 'The current thinking step'
              },
              nextThoughtNeeded: {
                type: 'boolean',
                description: 'Whether another thought step is needed'
              },
              thoughtNumber: {
                type: 'integer',
                description: 'Current thought number'
              },
              totalThoughts: {
                type: 'integer',
                description: 'Estimated total thoughts needed'
              },
              isRevision: {
                type: 'boolean',
                description: 'Whether this revises previous thinking',
                nullable: true
              },
              revisesThought: {
                type: 'integer',
                description: 'Which thought is being reconsidered',
                nullable: true
              },
              branchFromThought: {
                type: 'integer',
                description: 'Branching point thought number',
                nullable: true
              },
              branchId: {
                type: 'string',
                description: 'Branch identifier',
                nullable: true
              },
              needsMoreThoughts: {
                type: 'boolean',
                description: 'If more thoughts are needed',
                nullable: true
              }
            },
            required: ['thought', 'nextThoughtNeeded', 'thoughtNumber', 'totalThoughts']
          }
        }
      ],
    }));

    // Handle sequential thinking tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== 'sequential_thinking') {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
      }

      const args = request.params.arguments || {};
      
      // Validate required arguments
      if (typeof args.thought !== 'string') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Invalid thought argument: must be a string'
        );
      }
      
      if (typeof args.nextThoughtNeeded !== 'boolean') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Invalid nextThoughtNeeded argument: must be a boolean'
        );
      }
      
      if (typeof args.thoughtNumber !== 'number') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Invalid thoughtNumber argument: must be a number'
        );
      }
      
      if (typeof args.totalThoughts !== 'number') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Invalid totalThoughts argument: must be a number'
        );
      }

      // Process the sequential thinking step
      const processResult = this.processSequentialThought(args);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(processResult, null, 2)
          }
        ]
      };
    });
  }

  private processSequentialThought(args: any) {
    // This simulates the sequential thinking process
    const result = {
      processedThought: args.thought,
      thoughtNumber: args.thoughtNumber,
      totalThoughts: args.totalThoughts,
      nextThoughtNeeded: args.nextThoughtNeeded,
      timestamp: new Date().toISOString(),
      analysis: this.generateAnalysis(args)
    };

    // Add optional fields if provided
    if (args.isRevision !== undefined) {
      result['isRevision'] = args.isRevision;
    }
    
    if (args.revisesThought !== undefined) {
      result['revisesThought'] = args.revisesThought;
    }
    
    if (args.branchFromThought !== undefined) {
      result['branchFromThought'] = args.branchFromThought;
    }
    
    if (args.branchId !== undefined) {
      result['branchId'] = args.branchId;
    }
    
    if (args.needsMoreThoughts !== undefined) {
      result['needsMoreThoughts'] = args.needsMoreThoughts;
    }

    return result;
  }

  private generateAnalysis(args: any) {
    // Generate analysis based on the thought parameters
    const analysisParts = [];
    
    analysisParts.push(`Thought ${args.thoughtNumber} of ${args.totalThoughts}`);
    
    if (args.isRevision) {
      analysisParts.push(`Revising thought ${args.revisesThought}`);
    }
    
    if (args.branchFromThought) {
      analysisParts.push(`Branching from thought ${args.branchFromThought}`);
    }
    
    if (args.branchId) {
      analysisParts.push(`Branch ID: ${args.branchId}`);
    }
    
    if (args.nextThoughtNeeded) {
      analysisParts.push("More thoughts needed");
    } else {
      analysisParts.push("Complete");
    }
    
    return analysisParts.join(", ");
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Sequential Thinking MCP server running on stdio');
  }
}

const server = new SequentialThinkingServer();
server.run().catch(console.error);