---
title: "Troubleshooting"
description: "Common issues and solutions for Duck-UI"
---

This guide helps you resolve common issues when using Duck-UI. If you encounter problems not covered here, please check our [GitHub Issues](https://github.com/caioricciuti/duck-ui/issues).

## Common Issues

### WASM Loading

#### Problem: "Failed to load DuckDB WASM module"

**Symptoms**:
- Application loads but database doesn't initialize
- Console shows WASM loading errors
- Blank screen or infinite loading

**Solutions**:

1. **Check browser compatibility**:
   ```
   Chrome/Edge: Version 88+
   Firefox: Version 79+
   Safari: Version 14+
   ```

2. **Clear browser cache**:
   - Press `Ctrl+Shift+Delete` (Windows/Linux) or `Cmd+Shift+Delete` (Mac)
   - Select "Cached images and files"
   - Clear cache and reload

3. **Disable browser extensions**:
   - Ad blockers or security extensions may block WASM
   - Try in incognito/private mode
   - Disable extensions temporarily

4. **Check network/CORS**:
   - Ensure WASM files can be downloaded
   - Check browser console for network errors
   - If self-hosting, verify MIME types are configured

#### Problem: "WebAssembly compilation failed"

**Solutions**:
- Update your browser to the latest version
- Check if your browser has WebAssembly disabled
- Try a different browser

### OPFS Storage

#### Problem: "OPFS not available in this browser"

**Symptoms**:
- Can't create persistent databases
- OPFS option missing in connection dialog
- Error when trying to attach databases

**Solutions**:

1. **Browser support**:
   - Chrome/Edge 86+: Full support
   - Firefox: Experimental support (enable via flags)
   - Safari 15.2+: Limited support

2. **Enable Firefox OPFS** (if needed):
   ```
   1. Open about:config
   2. Search for: dom.fs.enabled
   3. Set to: true
   4. Restart browser
   ```

3. **Check storage quota**:
   - OPFS requires available storage
   - Check browser storage settings
   - Clear old data if needed

4. **Use WASM mode instead**:
   - WASM mode works without OPFS
   - Data doesn't persist across sessions
   - Good for temporary analysis

#### Problem: "Quota exceeded" when saving to OPFS

**Solutions**:
- Clear browser storage: Settings > Privacy > Clear browsing data
- Delete unused databases from OPFS
- Use external connection for large databases
- Export data before clearing

### File Import

#### Problem: "Failed to import CSV file"

**Symptoms**:
- Import button doesn't work
- Error message after selecting file
- Preview doesn't load

**Solutions**:

1. **Check file format**:
   ```sql
   -- Test with simple query first
   SELECT * FROM read_csv('your_file.csv')
   LIMIT 10;
   ```

2. **Adjust CSV options**:
   - Enable "Ignore errors" for malformed data
   - Check delimiter (comma, semicolon, tab)
   - Verify "Has header row" setting
   - Try auto-detect types

3. **File size limits**:
   - Browser memory limits apply
   - Try sampling large files first
   - Use external DuckDB for huge datasets

4. **Encoding issues**:
   - Ensure file is UTF-8 encoded
   - Check for special characters
   - Try re-saving file with UTF-8 encoding

#### Problem: "URL import fails with CORS error"

**Symptoms**:
- Can't import from URLs
- Console shows CORS policy error
- Works locally but fails from URL

**Solutions**:

1. **CORS restrictions**:
   - Server must allow cross-origin requests
   - Contact server admin to enable CORS
   - Use proxy service if needed

2. **Alternative approaches**:
   - Download file and import locally
   - Use curl/wget to fetch, then import
   - Host file on CORS-enabled server

3. **Test with public datasets**:
   ```sql
   -- Known working URL
   SELECT * FROM read_csv('https://raw.githubusercontent.com/...');
   ```

### File System Access

#### Problem: "File System Access not supported"

**Symptoms**:
- "Files" section shows unsupported message
- Add Folder option missing or disabled
- Folder browser not appearing

**Solutions**:

1. **Browser support**:
   ```
   Chrome: 86+
   Edge: 86+
   Opera: 72+
   Firefox: Not supported
   Safari: Not supported
   ```

2. **Use standard file import**:
   - Click the **Import data** button in the explorer header, or drop files on the explorer
   - Select files individually
   - Works in all browsers

3. **Update browser**:
   - Ensure Chrome/Edge is version 86 or newer
   - Check for browser updates

#### Problem: "Permission denied" for mounted folder

**Symptoms**:
- Folder shows warning icon
- Can't expand or browse folder contents
- "Permission denied" error

**Solutions**:

1. **Re-grant permission**:
   - Click on the folder with the warning icon
   - Browser will prompt for permission
   - Click "Allow" or "Grant" to continue

2. **Page was reloaded**:
   - Browser requires re-permission after reload (security feature)
   - This is normal behavior, not a bug
   - Click the folder to trigger the permission prompt

3. **Remove and re-add**:
   - Right-click folder > Unmount
   - Add the folder again
   - Grant fresh permissions

#### Problem: "Large folders are slow to load"

**Solutions**:

1. **Mount specific subfolders**:
   - Instead of mounting root directory
   - Add the specific data folder you need

2. **Wait for initial load**:
   - First load scans for supported files
   - Subsequent accesses are faster

3. **Use fewer mounted folders**:
   - Unmount folders you're not using
   - Keep the sidebar clean

### Duck Brain AI

#### Problem: "WebGPU Not Supported"

**Symptoms**:
- Can't use the in-browser model
- Error message about WebGPU
- Duck Brain panel shows unsupported

Only the in-browser provider needs WebGPU. A local server (Ollama, LM Studio), OpenAI and Anthropic work without it.

**Solutions**:

1. **Browser support**:
   ```
   Chrome: 113+ (WebGPU required)
   Edge: 113+ (WebGPU required)
   Firefox: Not supported
   Safari: Not supported
   ```

2. **Check WebGPU status**:
   - Navigate to `chrome://gpu`
   - Look for "WebGPU" section
   - Should show "Hardware accelerated"

3. **Enable WebGPU** (if disabled):
   - Navigate to `chrome://flags`
   - Search for "WebGPU"
   - Enable and restart browser

4. **Use another provider**:
   - Go to Settings > AI
   - Point Duck Brain at a local Ollama or LM Studio, or add an OpenAI or Anthropic API key
   - These work in any browser

#### Problem: "Connection failed" with a local server

**Symptoms**:
- **Test & save** in Settings > AI reports a failed connection
- **Find models** returns nothing

**Solutions**:

1. **Check the server**:
   - Ollama listens on `http://localhost:11434/v1`, LM Studio on `http://localhost:1234/v1`
   - The base URL must end in `/v1`

2. **Browser origins**:
   - Ollama blocks unknown browser origins by default
   - `localhost` works out of the box; from a deployed Duck-UI start Ollama with `OLLAMA_ORIGINS=https://your-origin`

3. **Pick a model the server has**:
   - Click **Find models** and choose from the list

#### Problem: "Model download failed"

**Symptoms**:
- Progress bar stalls
- Download error message
- Model never finishes loading

**Solutions**:

1. **Check network**:
   - Ensure stable internet connection
   - Try disabling VPN temporarily
   - Check firewall settings

2. **Clear cache and retry**:
   - Settings > AI > In-browser models > **Clear cache**
   - Reload page and try again

3. **Try smaller model**:
   - Llama 3.2 1B is only ~1.1GB
   - Faster to download

4. **Check disk space**:
   - Models are cached locally
   - Need ~3GB free space

#### Problem: "AI responses are slow"

**Solutions**:

1. **GPU performance**:
   - Close other GPU-intensive apps
   - Dedicated GPU is faster than integrated

2. **Try smaller model**:
   - Llama 3.2 1B is fastest
   - Trade quality for speed

3. **Use a local server or cloud AI**:
   - Full size models at native speed
   - No WebGPU needed

4. **Browser resources**:
   - Close unused tabs
   - Restart browser if sluggish

#### Problem: "Cloud AI API key not working"

**Solutions**:

1. **Verify API key**:
   - Copy key exactly (no extra spaces)
   - Check key hasn't expired

2. **Check permissions**:
   - OpenAI: Ensure key has Chat/Completions access
   - Anthropic: Verify key is active

3. **Check credits/quota**:
   - Ensure account has available credits
   - Check usage limits

4. **Generate new key**:
   - Create fresh API key
   - Delete old key from settings

### External Connections

#### Problem: "Cannot connect to external DuckDB server"

**Symptoms**:
- Connection times out
- Authentication fails
- Server not accessible

**Solutions**:

1. **Verify environment variables** (name, host and port are all required):
   ```bash
   DUCK_UI_EXTERNAL_CONNECTION_NAME="My Server"
   DUCK_UI_EXTERNAL_HOST=http://your-server
   DUCK_UI_EXTERNAL_PORT=8000
   DUCK_UI_EXTERNAL_USER=username
   DUCK_UI_EXTERNAL_PASS=password
   # or, instead of user and password:
   DUCK_UI_EXTERNAL_API_KEY=your-key
   ```

2. **Check network connectivity**:
   ```bash
   # Test from Docker host
   curl http://your-server:8000/health
   ```

3. **Firewall/security**:
   - Verify firewall rules allow connection
   - Check if VPN is required
   - Ensure ports are open

4. **Docker networking**:
   - The browser makes the requests, not the container, so the host must be reachable from the browser
   - Use a host name or IP the browser can resolve, not a Compose service name
   - Check Docker network configuration

#### Problem: "External connection appears but can't query"

**Solutions**:
- Check DuckDB HTTP API is enabled on server
- Verify authentication credentials
- Test with DuckDB CLI first
- Review server logs for errors

### Extensions

#### Problem: "Extension loading failed"

**Symptoms**:
- `INSTALL extension` fails
- Extension not found
- Unsigned extension error

**Solutions**:

1. **Use the Extensions page**:
   - Data group in the left rail > Extensions lists what is available for the active connection
   - Extensions without a build for the WASM platform carry a warning badge

2. **Enable unsigned extensions**:
   ```bash
   docker run -e DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS="true" ...
   ```

3. **Check extension compatibility**:
   - Not all extensions work with WASM
   - Verify extension is WASM-compatible
   - Check DuckDB version compatibility

4. **Common working extensions**:
   ```sql
   -- These typically work in WASM
   INSTALL httpfs;
   LOAD httpfs;

   INSTALL json;
   LOAD json;
   ```

5. **Extensions that don't work in WASM**:
   - Extensions requiring native libraries
   - Platform-specific extensions
   - Some database connectors

### Performance

#### Problem: "Queries are slow in browser"

**Solutions**:

1. **Optimize queries**:
   ```sql
   -- Use LIMIT for exploration
   SELECT * FROM large_table LIMIT 1000;

   -- Filter early
   SELECT * FROM table
   WHERE date > '2024-01-01'  -- Filter first
   LIMIT 1000;
   ```

2. **Memory management**:
   - Raise or lower the DuckDB memory limit in Settings > Performance
   - Lower "Maximum rows per result" in Settings > Performance; a result cut at the limit is still sorted and filtered over the full answer
   - Close unused query tabs
   - Clear the History page periodically
   - Restart browser if memory is high

3. **Use external connection for large datasets**:
   - WASM mode has memory limits
   - External DuckDB for production workloads
   - Better performance for large datasets

4. **Browser selection**:
   - Chrome/Edge generally fastest
   - Use desktop, not mobile
   - Close other browser tabs

### Editor

#### Problem: "Only part of my SQL ran"

`⌘Enter` (`Ctrl+Enter` on Windows and Linux) runs the selection, or the single statement under the cursor when nothing is selected. Use `⌘Shift+Enter` to run the whole tab.

#### Problem: "A shortcut does nothing"

- `⌘K` opens the command menu, `⌥N` a new query, `⌥W` closes the tab, `⌘B` toggles the explorer, `Alt+F` formats
- `⌥N` and `⌥W` are bound to the physical N and W keys, so they work on any keyboard layout
- `⌘B` and `/` (command menu) are ignored while typing in an input

#### Problem: "The page asks 'Leave site?' when closing"

Duck-UI asks before every close or reload, so a stray shortcut does not close the workspace. Your work saves itself either way: choosing Leave loses nothing.

### Docker Issues

#### Problem: "Docker container won't start"

**Solutions**:

1. **Check Docker logs**:
   ```bash
   docker logs duck-ui
   ```

2. **Port conflicts**:
   ```bash
   # Check if port is in use
   lsof -i :5522

   # Use different port
   docker run -p 5523:5522 ...
   ```

3. **Environment variable syntax**:
   ```bash
   # Correct
   -e DUCK_UI_EXTERNAL_HOST="http://server"

   # Incorrect (no quotes may cause issues)
   -e DUCK_UI_EXTERNAL_HOST=http://server
   ```

4. **Image issues**:
   ```bash
   # Pull latest image
   docker pull ghcr.io/caioricciuti/duck-ui:latest

   # Remove old containers
   docker rm duck-ui
   ```

#### Problem: "Changes to environment variables not taking effect"

**Solutions**:
```bash
# Stop and remove container
docker stop duck-ui && docker rm duck-ui

# Recreate with new variables
docker run --name duck-ui -p 5522:5522 \
  -e DUCK_UI_EXTERNAL_HOST="new-value" \
  ghcr.io/caioricciuti/duck-ui:latest
```

## Browser-Specific Issues

### Chrome/Edge

**Problem**: High memory usage

**Solutions**:
- Use Task Manager (Shift+Esc) to monitor tabs
- Enable "Memory Saver" in chrome://settings
- Close unused tabs and extensions

### Firefox

**Problem**: OPFS features unavailable

**Solutions**:
- Enable `dom.fs.enabled` in about:config
- Update to Firefox 111+ for better support
- Use WASM mode if OPFS unavailable

### Safari

**Problem**: Limited OPFS support

**Solutions**:
- Update to Safari 15.2+
- Use WASM mode for reliability
- Consider Chrome/Edge for full features

## Getting Help

If you're still experiencing issues:

1. **Check GitHub Issues**: [github.com/caioricciuti/duck-ui/issues](https://github.com/caioricciuti/duck-ui/issues)
2. **Start a Discussion**: [github.com/caioricciuti/duck-ui/discussions](https://github.com/caioricciuti/duck-ui/discussions)
3. **Provide Details**:
   - Browser version
   - Operating system
   - Error messages (console logs)
   - Steps to reproduce
   - Duck-UI version (shown on the Home tab and at the bottom of the Settings sidebar)

## Useful Debugging

### Check DuckDB Version

```sql
SELECT version();
```

### Check Available Extensions

```sql
SELECT * FROM duckdb_extensions();
```

### Check Browser Storage

```javascript
// In browser console
navigator.storage.estimate().then(estimate => {
  console.log(`Used: ${estimate.usage} bytes`);
  console.log(`Quota: ${estimate.quota} bytes`);
});
```

### Enable Verbose Logging

Open browser DevTools (F12) and check:
- Console tab for JavaScript errors
- Network tab for failed requests
- Application tab for storage inspection

## Next Steps

- [Environment Variables](/docs/environment-variables) - Configuration guide
- [Getting Started](/docs/getting-started) - Installation guide
- [GitHub Issues](https://github.com/caioricciuti/duck-ui/issues) - Report bugs
