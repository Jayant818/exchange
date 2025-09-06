import WebSocket from "ws";
import { createClient } from "redis";
import { KafkaProducer } from "@repo/shared-kafka";

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
  const producer = KafkaProducer.getInstance().getProducer();

  let SOL_PRICE: price | Object = {};
  let BTC_PRICE: price | Object = {};
  let ETH_PRICE: price | Object = {};

  const redisClient = await createClient().connect();

  ws.on("open", function open() {
    ws.send(
      JSON.stringify({
        method: "SUBSCRIBE",
        params: [
          "bookTicker.SOL_USDC",
          "bookTicker.BTC_USDC",
          "bookTicker.ETH_USDC",
        ],
        id: 1,
      })
    );
  });

  ws.on("message", (msg) => {
    const data = JSON.parse(msg.toString());
    if (data.stream === "bookTicker.SOL_USDC") {
      SOL_PRICE = Math.round(parseFloat(data.data.a) * 100);
    } else if (data.stream === "bookTicker.BTC_USDC") {
      BTC_PRICE = Math.round(parseFloat(data.data.a) * 100);
    } else {
      ETH_PRICE = Math.round(parseFloat(data.data.a) * 100);
    }
    console.log(data);
  });

  setInterval(() => {
    producer.send({
      topic: "current_price",
      messages: [
        {
          value: JSON.stringify({
            SOL_PRICE,
            ETH_PRICE,
            BTC_PRICE,
          }),
        },
      ],
    });
  }, 100);
}

main();
