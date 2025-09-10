import WebSocket from "ws";
import { KafkaProducer } from "@repo/shared-kafka";
import {
  EVENT_TYPE,
  ORDER_TOPIC,
  POLLING_ENGINE_QUEUE_NAME,
} from "@repo/common";
import { publisher as RedisQueue } from "@repo/shared-redis";

interface price {
  A: string; // Best ask Quantity`
  B: string; // Best bid Quantity
  E: number; // Event time
  T: number; // Trade time
  a: string; // Best ask Price [ lowest sell price ]
  b: string; // Best bid Price [ highest buy price ]
  e: string; // Event Type
  s: string; // Trading Pair
  u: number; // Update Id
}

// Trade interface
/*
e:"trade" // Event Type
E: 123456789 // Event time
s:"SOL_USDC" // Trading Pair
t: 123456789 // Trade ID
p: "20.00000000" // Price
q: "0.10000000" // Quantity
T: 123456785 // Trade time
M: true // Ignore
m: false // Is the buyer the market maker?

*/

async function main() {
  const ws = new WebSocket("wss://ws.backpack.exchange/");
  ws.on("error", console.error);
  await KafkaProducer.getInstance().connect();

  const producer = KafkaProducer.getInstance().getProducer();

  let SOL_PRICE = 0;
  let BTC_PRICE = 0;
  let ETH_PRICE = 0;

  // Considering bookTicker price update as the trade as trade is not changing frequently
  ws.on("open", function open() {
    ws.send(
      JSON.stringify({
        method: "SUBSCRIBE",
        params: [
          "bookTicker.SOL_USDC",
          "bookTicker.BTC_USDC",
          "bookTicker.ETH_USDC",
          // "trade.SOL_USDC",
          // "trade.BTC_USDC",
          // "trade.ETH_USDC",
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
    } else if (data.stream === "bookTicker.ETH_USDC") {
      ETH_PRICE = Math.round(parseFloat(data.data.a) * 100);
    }

    const tradeTimeMs = Math.floor(Number(data.data.T) / 1000); // convert microseconds → milliseconds
    const eventTimeMs = Math.floor(Number(data.data.E) / 1000);

    RedisQueue.lPush(
      POLLING_ENGINE_QUEUE_NAME,
      JSON.stringify({
        e: "trade",
        E: eventTimeMs,
        s: data.data.s,
        t: data.data.u,
        p: data.data.a,
        q: data.data.A,
        T: tradeTimeMs,
        m: true,
        M: true,
      })
    );
    
    console.log(data);
  });

  setInterval(async () => {
    await producer.send({
      topic: ORDER_TOPIC,
      messages: [
        {
          value: JSON.stringify({
            type: EVENT_TYPE.PRICE_UPDATE,
            SOL_PRICE,
            ETH_PRICE,
            BTC_PRICE,
          }),
        },
      ],
    });
  }, 10000);
}

main();
