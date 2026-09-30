---
title: "Duck Brain AI"
description: "Natural language to SQL using a local model server, a cloud provider, or a model running in your browser"
---

Duck Brain is an AI assistant that helps you write SQL queries using natural language. It understands your database schema and generates SQL tailored to your data.

## Overview

Duck Brain supports four providers. Pick one in **Settings > AI**:

1. **Local server (OpenAI compatible)** - Ollama, LM Studio, or any endpoint that speaks the OpenAI API (vLLM, DeepSeek, and so on). Real models at native speed; nothing but the endpoint you set sees your prompts. This is the recommended private option.
2. **OpenAI** - with your own API key.
3. **Anthropic** - with your own API key.
4. **In-browser (experimental)** - WebLLM runs a small model inside the tab via WebGPU. Nothing is installed and nothing leaves the browser, at the cost of a large download, a short context and weaker SQL than a local server.

> **Privacy**: Whatever the provider, Duck Brain sends your question and a summary of your schema, never your data. The one exception is the optional "Explain results" action, which sends a small sample of rows and asks for your consent every time (unless the model runs in the browser).

## Browser Requirements

### For the in-browser provider (WebLLM)

The in-browser provider requires **WebGPU** support:

| Browser | Version | Support |
|---------|---------|---------|
| Chrome | 113+ | Full support |
| Edge | 113+ | Full support |
| Firefox | - | Not supported |
| Safari | - | Not supported |

> **WebGPU Required**: WebGPU is different from WebGL. Chrome/Edge 113+ have WebGPU enabled by default. Check `chrome://gpu` for WebGPU status.

### For every other provider

A local server, OpenAI and Anthropic work in any modern browser.

## Getting Started

### Opening Duck Brain

Duck Brain opens as a panel on the right side of the app, from any of these places:

- the **Ask Duck Brain** button in the SQL editor toolbar
- the Duck Brain card on the Home tab

Until a provider is configured, the panel offers an **Open AI settings** button.

### Using a local server

1. Start Ollama or LM Studio on your machine
2. Go to **Settings > AI** and choose **Local server (Ollama)**
3. Pick a preset (Ollama `http://localhost:11434/v1`, LM Studio `http://localhost:1234/v1`) or type a base URL
4. Click **Find models** and pick one, or type the model name
5. Click **Test & save**

> **Ollama and deployed Duck-UI**: Ollama blocks unknown browser origins by default. `localhost` works out of the box; from a deployed Duck-UI, start Ollama with `OLLAMA_ORIGINS=https://your-origin`.

### Using OpenAI or Anthropic

1. Go to **Settings > AI**
2. Choose **OpenAI** or **Anthropic**
3. Paste your API key and click **Save**. The key is verified with a test request and stored encrypted in this browser
4. Pick a model
5. Return to Duck Brain and start chatting

### Using the in-browser provider

1. Go to **Settings > AI**, open **In-browser models (experimental)** and click **Load** next to a model
2. Wait for the download (about 1 to 2.3 GB depending on the model)
3. Once loaded, the model is cached in browser storage for future sessions. **Clear cache** removes it
4. Type your question and press Enter

## Available Models

### In-browser models (WebLLM)

| Model | Size | Best For |
|-------|------|----------|
| **Phi-3.5 Mini** | ~2.3GB | Best balance of quality and performance, 4k context |
| Llama 3.2 1B | ~1.1GB | Fastest, good for quick queries |
| Qwen 2.5 1.5B | ~1GB | Good balance of size and capability |

### Cloud Models

**OpenAI:** GPT-5.1, GPT-5, GPT-5 Mini (default), GPT-4o

**Anthropic:** Claude Opus 5, Claude Sonnet 5 (default), Claude Haiku 4.5

**Local server:** whatever your server offers. **Find models** lists them.

## Using Duck Brain

### Asking Questions

Duck Brain understands natural language. Just describe what you want:

```
Show me the top 10 customers by total sales
```

```
Find all orders from last month where the amount is over $1000
```

```
What's the average order value by product category?
```

### Referencing Tables with @

Use `@` to reference specific tables or columns:

```
Show me all rows from @customers where status is active
```

```
Join @orders with @products and show the top sellers
```

When you type `@`, an autocomplete menu shows available tables and columns.

### Schema Awareness

Duck Brain automatically knows your database schema:
- Table names and their columns
- Column types (VARCHAR, INTEGER, etc.) and nullability
- Approximate row counts for each table

This context helps generate accurate SQL for your specific data. The input shows a rough estimate of the tokens that will be sent (schema context, chat history, system prompt and your message).

### Running Generated SQL

Every SQL block in a reply has a row of actions:

1. **Copy** the SQL
2. **Insert** replaces the query in the current SQL tab
3. **New tab** opens the SQL in a new tab
4. **Run** executes it right away, with the result shown inline in the chat

### Fixing a failed query

When a query fails in the SQL editor, the error bar offers **Fix with Duck Brain**. The suggested fix replaces the query; review it and run again.

### Actions on a result

The **Duck Brain** button in the result panel toolbar offers three tasks:

- **Explain results**: sends a small sample of rows and asks for consent first
- **Optimize query**: proposes a faster version of the SQL
- **Suggest chart**: proposes a chart configuration for the result

### Switching Providers

If you have more than one provider configured, a provider selector appears in the Duck Brain header. For OpenAI and Anthropic a model selector sits next to it.

## How It Works

### In-browser flow

```
User Query -> Duck Brain -> WebLLM Engine -> WebGPU -> GPU
                |
          Schema Context
                |
         SQL Generation
                |
            Response
```

1. Your question is combined with database schema context
2. The local LLM (running via WebLLM) generates SQL
3. All processing happens on your GPU via WebGPU
4. No data ever leaves your browser

### Server flow (local server, OpenAI, Anthropic)

```
User Query + Schema -> API Request -> Provider -> Response
```

1. Your question and schema summary are sent to the endpoint
2. The model generates SQL
3. The response is streamed back to your browser

> **Privacy**: The query and a summary of your schema are sent to the provider. Actual data values are never sent, except by the "Explain results" action, which asks first.

## Best Practices

### Writing Good Prompts

1. **Be specific**: "Show sales by month for 2024" is better than "show me sales"
2. **Reference tables**: Use `@table_name` to be explicit
3. **Describe the output**: "as a percentage" or "ordered by date descending"

### For Complex Queries

1. Start simple, then refine
2. Ask for explanations: "Explain this query"
3. Request modifications: "Now add a filter for status = 'active'"

### Performance Tips

1. **In-browser models**:
   - First load downloads 1 to 2.3 GB
   - Subsequent loads use the cached model
   - GPU memory affects performance

2. **Local server**:
   - Runs full size models at native speed
   - Nothing leaves your machine

3. **Cloud AI**:
   - Faster initial response
   - No local GPU required
   - Requires an internet connection

## Troubleshooting

### "WebGPU Not Supported"

**Problem**: Can't use the in-browser provider

**Solutions**:
1. Update to Chrome/Edge 113+
2. Check `chrome://gpu` for WebGPU status
3. Try enabling `#enable-unsafe-webgpu` flag
4. Use a local server or a cloud provider instead; they do not need WebGPU

### "Model download failed"

**Problem**: Can't download the in-browser model

**Solutions**:
1. Check internet connection
2. Clear browser cache and retry
3. Try a smaller model (Llama 3.2 1B)
4. Check available disk space

### "Generation is slow"

**Problem**: AI responses take too long

**Solutions**:
1. Try a smaller model
2. Close other GPU-intensive applications
3. Use a local server or cloud AI for faster responses
4. Reduce query complexity

### "Connection failed" with a local server

**Solutions**:
1. Check the server is running and the base URL ends in `/v1`
2. From a deployed Duck-UI, set `OLLAMA_ORIGINS` to your origin
3. Click **Find models** to confirm the server answers

### "API key invalid"

**Problem**: Cloud AI not working

**Solutions**:
1. Verify API key is correct
2. Check API key permissions
3. Ensure you have API credits
4. Try generating a new key

## Technical Details

### WebLLM Integration

Duck Brain uses [WebLLM](https://webllm.mlc.ai/) for in-browser inference:

- Runs optimized LLMs in browser via WebGPU
- Models are quantized (4-bit) for efficiency
- Cached in browser storage
- Loaded on first use, not at startup, so the app stays small for everyone else

### Schema Context

Before each generation, Duck Brain builds a schema context in `CREATE TABLE` form:

```sql
CREATE TABLE customers (
  id INTEGER NOT NULL,
  name VARCHAR,
  email VARCHAR
);
-- Approximately 1,234 rows

CREATE TABLE orders (
  id INTEGER NOT NULL,
  customer_id INTEGER,
  amount DECIMAL
);
-- Approximately 5,678 rows
```

This context is prepended to your question so the model understands your data structure. Very large schemas are truncated to fit the context limit.
