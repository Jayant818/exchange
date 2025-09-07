import { ENGINE_TO_SERVER, EVENT_TYPE, ORDER_TOPIC } from "@repo/constants";
import { KafkaProducer } from "@repo/shared-kafka";
import { Kafka } from "kafkajs";
import { Heap } from "heap-js";

const PRICE_CHANNEL = "price_update";

enum ASSET {
  BTC = "BTC",
  ETH = "ETH",
  SOL = "SOL",
}

type Asset = keyof typeof ASSET;

// userId -> Balance
// Assets are assets that are borrowed for leverage trading.
let Users = new Map<
  string,
  { balance: number; assets?: Record<string, number>; lockedBalance?: number }
>();
// orderId -> Orders
let orders = new Map();

// user->orderIds[]
let mappedOrderswithUser = new Map<string, string[]>();

let assetPrice = new Map<Asset, number>();

let maxHeapForLongLiquation = new Heap<{
  liquidationPrice: number;
  orderId: string;
}>((a, b) => b.liquidationPrice - a.liquidationPrice);

let CLOSED_ORDERS = new Map();

setInterval(() => {
  console.log("USERS", Users);
  console.log("ORDERS", orders);
  console.log("MAPPED_ORDERS", mappedOrderswithUser);
}, 20000);

function lockBalance(email: string, amount: number): boolean {
  const user = Users.get(email);
  if (!user) {
    console.log("User not found:", email);
    return false;
  }

  if (user.balance >= amount) {
    user.balance -= amount;
    user.lockedBalance = (user.lockedBalance || 0) + amount;
    return true;
  }

  console.log("Insufficient balance:", email);
  return false;
}

function unlockBalance(email: string, amount: number): boolean {
  const user = Users.get(email);
  if (!user || !user.lockedBalance || user.lockedBalance < amount) {
    console.log("Cannot unlock balance, insufficient locked balance:", email);
    return false;
  }

  user.balance += amount;
  user.lockedBalance -= amount;
  return true;
}

function getMarginRequired(leverage: number, Qty: number, asset: Asset) {
  let margin = 0;
  let price = assetPrice.get(asset);

  if (!price) {
    console.log("Price not available for asset:", asset);
    return 0;
  }

  // Margin is scaled by 100
  margin = (Qty * price) / leverage;

  return margin;
}

function addBorrowedAsset(email: string, asset: Asset, qty: number) {
  const user = Users.get(email);
  if (!user) {
    console.log("User not found:", email);
    return false;
  }

  if (!user.assets) {
    user.assets = {};
  }

  user.assets[asset] = (user.assets[asset] || 0) + qty;
  return true;
}

function getCurrentPrice(asset: Asset): number {
  return assetPrice.get(asset) || 0;
}

function getLeveragedPriceLimit(
  side: "BUY" | "SELL",
  leverage: number,
  price: number
): number {
  if (side === "BUY") {
    const marginForOneUnit = price / leverage;

    return price - marginForOneUnit;
  } else {
    // For Sell orders, the price limit is lower due to leverage and slippage
    const marginForOneUnit = price / leverage;

    return price + marginForOneUnit;
  }
}

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
            await producer.send({
              topic: ENGINE_TO_SERVER,
              messages: [
                {
                  value: JSON.stringify({
                    msgId: parsed.msgId,
                    email,
                    balance,
                  }),
                },
              ],
            });
            break;
          }

          case EVENT_TYPE.ORDER_CREATED: {
            const {
              msgId: orderId,
              asset,
              side,
              qty,
              leverage,
              slippage,
              email,
              price,
            } = parsed;

            if (
              !assetPrice.has(asset) ||
              !leverage ||
              !qty ||
              slippage < 0 ||
              !email
            ) {
              console.log("Invalid Parameter");
              break;
            }

            if (!Users.has(email)) {
              console.log("User not found for order:", email);
              break;
            }

            // Lock the balance according to the leverage and qty

            const margin = getMarginRequired(leverage, qty, asset);

            const slippageAmount = price * slippage;
            const actualPriceForAnAsset = getCurrentPrice(asset);

            const fullPrice = actualPriceForAnAsset * qty;

            if (slippageAmount < fullPrice - price) {
              console.log("Slippage too high, order rejected:", orderId);
              break;
            }

            let amountToLock = margin * leverage;

            lockBalance(email, amountToLock);

            orders.set(orderId, {
              asset,
              side,
              qty,
              margin,
              leverage,
              slippage,
              email,
              boughtPrice: fullPrice,
              status: "OPEN",
            });

            if (!mappedOrderswithUser.has(email)) {
              mappedOrderswithUser.set(email, []);
            }

            mappedOrderswithUser.get(email)?.push(orderId);

            addBorrowedAsset(email, asset, qty);

            const leveragedPriceLimit = getLeveragedPriceLimit(
              side,
              leverage,
              actualPriceForAnAsset
            );

            if (side === "BUY") {
              maxHeapForLongLiquation.push({
                liquidationPrice: leveragedPriceLimit,
                orderId,
              });
            } else {
              // For SELL orders, we can implement a min-heap for short liquidation if needed
            }

            // orders.set(orderId, { asset, side, margin, leverage, slippage });
            // Map order to user if needed
            console.log("Order Created:", orderId, asset, side);
            break;
          }

          case EVENT_TYPE.ORDER_CANCELLED: {
            const { msgId: orderId, email } = parsed;
            orders.delete(orderId);
            console.log("Order Cancelled:", orderId);
            break;
          }

          case EVENT_TYPE.ORDER_CLOSED: {
            const { orderId, email } = parsed;
            orders.delete(orderId);
            console.log("Order Closed:", orderId);
            break;
          }

          case EVENT_TYPE.PRICE_UPDATE: {
            const { SOL_PRICE, BTC_PRICE, ETH_PRICE } = parsed;
            console.log("Price Update:", { SOL_PRICE, BTC_PRICE, ETH_PRICE });
            assetPrice.set(ASSET.SOL, SOL_PRICE);
            assetPrice.set(ASSET.BTC, BTC_PRICE);
            assetPrice.set(ASSET.ETH, ETH_PRICE);

            Array.from(assetPrice.keys()).forEach((asset) => {
              console.log(`Current price of ${asset}:`, assetPrice.get(asset));

              while (maxHeapForLongLiquation.size() > 0) {
                const top = maxHeapForLongLiquation.peek();
                if (
                  top &&
                  assetPrice.get(asset) !== undefined &&
                  assetPrice.get(asset)! <= top.liquidationPrice
                ) {
                  const liquidatedOrder = maxHeapForLongLiquation.pop();
                  if (liquidatedOrder) {
                    const { qty, boughtPrice, margin, email } = orders.get(
                      liquidatedOrder.orderId
                    );
                    let pnl = 0;

                    pnl = getCurrentPrice(asset) * qty - boughtPrice;
                    let balanceToReturn = margin + pnl;

                    // unlock balance
                    unlockBalance(email, margin);

                    // Update user balance
                    const user = Users.get(email);
                    if (user) {
                      user.balance += pnl;
                    }

                    const orderDetails = orders.get(liquidatedOrder.orderId);

                    if (orderDetails) {
                      console.log(
                        "Order Liquidated due to price drop:",
                        liquidatedOrder.orderId
                      );
                      orders.delete(liquidatedOrder.orderId);
                      CLOSED_ORDERS.set(liquidatedOrder.orderId, {
                        ...orderDetails,
                        status: "LIQUIDATED",
                        pnl,
                      });
                    }
                  }
                } else {
                  break;
                }
              }
            });
            break;
          }

          case EVENT_TYPE.BALANCE_CHECK_USD: {
            console.log("Balance check event received:", parsed);
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
            const { msgId, balance, email } = parsed;
            console.log("Full Balance Check:", msgId, balance, email);

            const totalAssets = Users.get(email) || {};

            await producer.send({
              topic: ENGINE_TO_SERVER,
              messages: [
                {
                  value: JSON.stringify({
                    msgId,
                    assets: totalAssets,
                  }),
                },
              ],
            });

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
