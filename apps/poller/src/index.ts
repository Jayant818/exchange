import WebSocket from "ws";
import { createClient } from "redis";

const PRICE_CHANNEL = "price_update";

interface price {
  A: string;
  B: string;
  E: number;
  T: number;
  a: string;
  b: string;
  e: string;
  s: string;
  u: number;
}

async function main() {
  const ws = new WebSocket("wss://ws.backpack.exchange/");
  ws.on("error", console.error);

  let SOL_PRICE: price;
  let BTC_PRICE: price;
  let ETH_PRICE: price;

  const redisClient = await createClient().connect();

  ws.on("open", function open() {
    ws.send(
      JSON.stringify({
        method: "SUBSCRIBE",
        params: ["trade.SOL_USDC", "trade.BTC_USDC", "trade.ETH_USDC"],
        id: 4,
      })
    );

    //   ws.send(
    //     JSON.stringify({
    //       method: "SUBSCRIBE",
    //       params: ["bookTicker.SOL_USDC_PERP"],
    //       id: 2,
    //     })
    //   );
  });

  ws.on("message", (msg) => {
    const data = JSON.parse(msg.toString());
    if (data.stream === "bookTicker.SOL_USDC") {
      SOL_PRICE = data.data;
    } else if (data.stream === "bookTicker.BTC_USDC") {
      BTC_PRICE = data.data;
    } else {
      ETH_PRICE = data.data;
    }
    console.log(data);
  });

  setInterval(() => {
    redisClient.publish(
      PRICE_CHANNEL,
      JSON.stringify({
        SOL_PRICE,
        ETH_PRICE,
        BTC_PRICE,
      })
    );
  }, 100);
}

main();
