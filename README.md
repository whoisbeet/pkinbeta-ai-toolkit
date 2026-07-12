# PKinBeta AI Toolkit (Gemini MCP Server)

A working Node.js/TypeScript Model Context Protocol (MCP) server wrapping Google's Gemini API via Express and SSE transport.

## Configuration

1. **Environment Variable**: Set `GEMINI_API_KEY` with your API key from [Google AI Studio](https://aistudio.google.com/).
2. **Installation**: `npm install`
3. **Build**: `npm run build`
4. **Start**: `npm start`

## MCP Usage

Connect via the SSE endpoint: `https://your-deployment.url/sse`
