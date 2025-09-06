import { Kafka } from "kafkajs";
import { createClient } from "redis";

const PRICE_CHANNEL = "price_update";

// userId -> Balancd
let Users = new Map<string, { balance: number }>();
// orderId -> Orders
let orders = new Map();

// user->orderIds[]
let mappedOrderswithUser = new Map<string, string[]>();

// Queue - Order Handle - API request - While looop
// pubsub subscribe kar rakha hai

async function main() {
  try {
    const kafkaClient = new Kafka({
      clientId: "my-app",
      brokers: ["localhost:9092"],
    });

    const consumer = kafkaClient.consumer({ groupId: "order-group" });
    await consumer.connect();

    await consumer.subscribe({
      topic: "current_price",
      fromBeginning: true,
    });

    await consumer.run({
      eachMessage: async (message) => {
        console.log(message.message.value?.toString());
      },
    });

    //     await consumer.connect();

    //     await consumer.subscribe({
    //       topic: "orders",
    //       fromBeginning: true,
    //     });

    //     await consumer.run({
    //       eachMessage: ({
    //         topic,
    //         partition,
    //         message,
    //         heartbeat = () => Promise.resolve(),
    //         pause = () => {},
    //       }) => {
    //         console.log(`
    // What is Lorem Ipsum?
    // Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.

    // Why do we use it?
    // It is a long established fact that a reader will be distracted by the readable content of a page when looking at its layout. The point of using Lorem Ipsum is that it has a more-or-less normal distribution of letters, as opposed to using 'Content here, content here', making it look like readable English. Many desktop publishing packages and web page editors now use Lorem Ipsum as their default model text, and a search for 'lorem ipsum' will uncover many web sites still in their infancy. Various versions have evolved over the years, sometimes by accident, sometimes on purpose (injected humour and the like).`);
    //         console.log({
    //           topic,
    //           partition,
    //           offset: message.offset,
    //           value: message.value ? message.value.toString() : null,
    //         });
    //         return Promise.resolve();
    //       },
    //     });
  } catch (error) {
    console.log("Error In engine", error);
  }
}

main();
