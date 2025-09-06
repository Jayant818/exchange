import { ENGINE_TO_SERVER, EVENT_TYPE, ORDER_TOPIC } from "@repo/constants";
import { KafkaProducer } from "@repo/shared-kafka";
import { Kafka } from "kafkajs";

const PRICE_CHANNEL = "price_update";

// userId -> Balance
let Users = new Map<
  string,
  { balance: number; assets?: Record<string, number> }
>();
// orderId -> Orders
let orders = new Map();

// user->orderIds[]
let mappedOrderswithUser = new Map<string, string[]>();

setInterval(() => {
  console.log("USERS", Users);
  console.log("ORDERS", orders);
  console.log("MAPPED_ORDERS", mappedOrderswithUser);
}, 20000);

async function main() {
  try {
    const kafkaClient = new Kafka({
      clientId: "my-app",
      brokers: ["localhost:9092"],
    });

    await KafkaProducer.getInstance().connect();

    const producer = KafkaProducer.getInstance().getProducer();

    const consumer = kafkaClient.consumer({ groupId: "order-group" });
    await consumer.connect();

    await consumer.subscribe({
      topic: ORDER_TOPIC,
      fromBeginning: true,
    });

    await consumer.run({
      eachMessage: async ({ message }) => {
        const val = message.value?.toString() || "";
        const parsed = JSON.parse(val);

        console.log("Received message:", parsed);

        if (!parsed) {
          return;
        }

        switch (parsed.type) {
          case EVENT_TYPE.USER_REGISTER: {
            const { email, balance } = parsed;
            Users.set(email, { balance });
            console.log("User Registered:", email, balance);
            break;
          }

          case EVENT_TYPE.ORDER_CREATED: {
            const {
              msgId: orderId,
              asset,
              side,
              margin,
              leverage,
              slippage,
            } = parsed;
            orders.set(orderId, { asset, side, margin, leverage, slippage });
            // Map order to user if needed
            console.log("Order Created:", orderId, asset, side);
            break;
          }

          case EVENT_TYPE.ORDER_CANCELLED: {
            const { msgId: orderId } = parsed;
            orders.delete(orderId);
            console.log("Order Cancelled:", orderId);
            break;
          }

          case EVENT_TYPE.ORDER_CLOSED: {
            const { orderId } = parsed;
            orders.delete(orderId);
            console.log("Order Closed:", orderId);
            break;
          }

          case EVENT_TYPE.PRICE_UPDATE: {
            const { SOL_PRICE, BTC_PRICE, ETH_PRICE } = parsed;
            console.log("Price Update:", { SOL_PRICE, BTC_PRICE, ETH_PRICE });
            break;
          }

          case EVENT_TYPE.BALANCE_CHECK_USD: {
            const { msgId, email } = parsed;

            const balance = Users.get(email)?.balance;

            await producer.send({
              topic: ENGINE_TO_SERVER,
              messages: [
                {
                  value: JSON.stringify({
                    msgId,
                    balance,
                  }),
                },
              ],
            });

            console.log("USD Balance Check:", msgId, email, balance);
            break;
          }

          case EVENT_TYPE.FULL_BALANCE_CHECK: {
            const { msgId, balance } = parsed;
            console.log("Full Balance Check:", msgId, balance);
            break;
          }

          case EVENT_TYPE.SUPPORTED_ASSETS: {
            const { msgId, assets } = parsed;
            console.log("Supported Assets:", msgId, assets);
            break;
          }

          default:
            console.warn("Unhandled event type:", parsed.type);
            break;
        }
      },
    });
  } catch (error) {
    console.log("Error In engine", error);
  }
}

main();
