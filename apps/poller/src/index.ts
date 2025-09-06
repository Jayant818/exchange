import WebSocket from "ws";
import { KafkaProducer } from "@repo/shared-kafka";
import { EVENT_TYPE, ORDER_TOPIC } from "@repo/constants";

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
  await KafkaProducer.getInstance().connect();

  const producer = KafkaProducer.getInstance().getProducer();

  let SOL_PRICE = 0;
  let BTC_PRICE = 0;
  let ETH_PRICE = 0;

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
