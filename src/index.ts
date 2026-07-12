import express from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();

// Enable CORS for Poke's validator and client
app.use(cors());
app.use(express.json());

const server = new Server(
  {
    name: 'pkinbeta-ai-toolkit',
    version: '1.2.0',
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
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      
      const response = result.response;
      const text = response.text();

      return {
        content: [{ type: 'text', text: text || 'Empty response' }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  }
  throw new Error(`Tool not found: ${request.params.name}`);
});

// Root path to prevent 404 during validation
app.get('/', (req, res) => {
  res.json({
    mcp_server: "pkinbeta-ai-toolkit",
    status: "active",
    endpoints: ["/sse", "/messages"]
  });
});

let transport: SSEServerTransport | null = null;

app.get('/sse', async (req, res) => {
  console.log('Establishing new SSE connection');
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  transport = new SSEServerTransport('/messages', res);
  await server.connect(transport);

  req.on('close', async () => {
    console.log('SSE connection closed');
    transport = null;
  });
});

app.post('/messages', async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send('No active SSE session found');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Gemini MCP server v1.2.0 listening on port ${PORT}`);
});
