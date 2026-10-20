// Detect silent mobile/network disconnects and keep transport errors isolated.
export function attachHeartbeat(wss, intervalMs = 30000, clock = Date.now) {
  wss.on('connection', ws => {
    ws.isAlive = true;
    ws.lastMessageAt = clock();
    ws.on('message', () => { ws.lastMessageAt = clock(); });
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('error', () => {});
  });
  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false || clock() - ws.lastMessageAt > 90000) { ws.terminate(); continue; }
      ws.isAlive = false;
      if (ws.readyState === 1) ws.ping();
    }
  }, intervalMs);
  timer.unref();
  wss.on('close', () => clearInterval(timer));
  return timer;
}
