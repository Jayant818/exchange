import { WebSocketServer } from "ws";

export function startMockWsServer(port: number) {
  const wss = new WebSocketServer({ port });

  wss.on("connection", (ws) => {
    const intervalId = setInterval(() => {
      ws.send(
        JSON.stringify({
          data: {
            A: "0.4586",
            B: "0.4903",
            E: 1757347893156403,
            T: 1757347893154454,
            a: "4361.24",
            b: "4361.01",
            e: "bookTicker",
            s: "ETH_USDC",
            u: 1476351631,
          },
          stream: "bookTicker.ETH_USDC",
        })
      );
    }, 500);

    ws.on("close", () => {
      clearInterval(intervalId);
    });
  });

  return wss;
}
