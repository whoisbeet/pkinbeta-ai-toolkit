import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
app.use(express.json()); // Essential for handling POST bodies in /messages

const server = new Server(
  {
    name: 'pkinbeta-ai-toolkit',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('GEMINI_API_KEY environment variable is required');
}

// Initializing with the standard model name. 
// Note: gemini-1.5-flash is the stable production identifier.
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'generate_text',
      description: 'Generate text using Google Gemini',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'The prompt to generate text from',
          },
        },
        required: ['prompt'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'generate_text') {
    const args = request.params.arguments as { prompt?: string } | undefined;
    const prompt = args?.prompt;
    if (!prompt) {
      throw new Error('Prompt is required');
    }

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      return {
        content: [
          {
            type: 'text',
            text,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error calling Gemini: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error(`Tool not found: ${request.params.name}`);
});

let transport: SSEServerTransport | null = null;

app.get('/sse', async (req, res) => {
  console.log('New SSE connection attempt');
  transport = new SSEServerTransport('/messages', res);
  await server.connect(transport);
});

app.post('/messages', async (req, res) => {
  console.log('Received message via /messages');
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send('No active SSE connection');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Gemini MCP server listening on port ${PORT}`);
});
