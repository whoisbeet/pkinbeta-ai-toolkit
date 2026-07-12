import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
app.use(express.json());

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

// Ensure proper initialization of the client
const genAI = new GoogleGenerativeAI(apiKey);
// Using the stable model identifier
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
      // Use simple non-streaming generateContent and wait for completion
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      
      const response = result.response;
      const text = response.text();

      if (!text) {
        throw new Error('Empty response from Gemini');
      }

      return {
        content: [
          {
            type: 'text',
            text: text,
          },
        ],
      };
    } catch (error) {
      console.error('Gemini API Error:', error);
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
  console.log('Establishing new SSE connection');
  transport = new SSEServerTransport('/messages', res);
  await server.connect(transport);
  
  // Clean up transport on connection close
  req.on('close', () => {
    console.log('SSE connection closed');
    transport = null;
  });
});

app.post('/messages', async (req, res) => {
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
