// Detect silent mobile/network disconnects and keep transport errors isolated.
export function attachHeartbeat(wss, intervalMs = 30000) {
  wss.on('connection', ws => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('error', () => {});
  });
  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) { ws.terminate(); continue; }
      ws.isAlive = false;
      if (ws.readyState === 1) ws.ping();
    }
  }, intervalMs);
  timer.unref();
  wss.on('close', () => clearInterval(timer));
  return timer;
}
