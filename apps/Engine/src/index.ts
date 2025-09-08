import { ENGINE_TO_SERVER, EVENT_TYPE, ORDER_TOPIC } from "@repo/constants";
import { KafkaProducer } from "@repo/shared-kafka";
import { Consumer, Kafka } from "kafkajs";
import { Heap } from "heap-js";
import {
  AppState,
  ASSET,
  Asset,
  ClosedOrderDetails,
  HeapItem,
  OrderDetails,
  UserData,
} from "./types";
import { deserialize, loadSnapShot, saveSnapShot } from "./snapshotter";
import "dotenv/config";

const PRICE_CHANNEL = "price_update";

let appState: AppState = {
  Users: new Map(),
  orders: new Map(),
  mappedOrderswithUser: new Map(),
  assetPrice: new Map(),
  maxHeapForLongLiquation: new Map<string, Heap<HeapItem>>(),
  minHeapForShortLiquidation: new Map<string, Heap<HeapItem>>(),
  CLOSED_ORDERS: new Map(),
};

let lastSnapShotTime = Date.now();
const SNAPSHOT_INTERVAL_MS = 10000;
// # If Multiple topics have same partitions then we will mix offsets of those topics
const lastProcessedOffsets: Record<string, string> = {};

function lockBalance(email: string, amount: number): boolean {
  const user = appState.Users.get(email);
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
  const user = appState.Users.get(email);
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
  let price = appState.assetPrice.get(asset);

  if (!price) {
    console.log("Price not available for asset:", asset);
    return 0;
  }

  // Margin is scaled by 100
  margin = (Qty * price) / leverage;

  return margin;
}

function addAsset(email: string, asset: Asset, qty: number) {
  const user = appState.Users.get(email);
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

function addBorrowedAsset(email: string, asset: Asset, qty: number) {
  const user = appState.Users.get(email);
  if (!user) {
    console.log("User not found:", email);
    return false;
  }

  if (!user.BorrowedAssets) {
    user.BorrowedAssets = {};
  }

  user.BorrowedAssets[asset] = (user.BorrowedAssets[asset] || 0) + qty;
  return true;
}

function getCurrentPrice(asset: Asset): number {
  return appState.assetPrice.get(asset) || 0;
}

function getLeveragedPriceLimit(
  side: "LONG" | "SHORT",
  leverage: number,
  price: number
): number {
  if (side === "LONG") {
    const marginForOneUnit = price / leverage;

    return price - marginForOneUnit;
  } else {
    // For Sell orders, the price limit is lower due to leverage and slippage
    const marginForOneUnit = price / leverage;

    return price + marginForOneUnit;
  }
}

function liquidateBorrowedAsset(
  email: string,
  asset: Asset,
  qty: number,
  fullPrice: number
) {
  const user = appState.Users.get(email);
  if (
    !user ||
    !user.BorrowedAssets ||
    (user.BorrowedAssets[asset] || 0) < qty
  ) {
    console.log("Cannot liquidate, insufficient borrowed assets:", email);
    return false;
  }

  if (!user.BorrowedAssets[asset]) {
    throw new Error("No borrowed assets to liquidate");
  }

  user.BorrowedAssets[asset] -= qty;

  if (!user) {
    console.log("User not found:", email);
    return false;
  }

  user.balance += fullPrice;

  return true;
}

async function loadSnapshotAndSeek(consumer: Consumer) {
  const snapshot = await loadSnapShot();
  if (snapshot) {
    appState = deserialize(snapshot.state);

    // assigning the last processed offsets from snapshot to the current offsets
    Object.assign(lastProcessedOffsets, snapshot.lastProcessedOffsets);

    console.log("state restored from snapshot");

    // seek is a method that lets you manually set the offset for a given topic-partition
    consumer.on(consumer.events.GROUP_JOIN, ({ payload }) => {
      // Get all topics and partitions assigned to this consumer
      const memberAssignments = payload.memberAssignment;

      // const seekOperations = [];

      for (const [topic, partitions] of Object.entries(memberAssignments)) {
        // Looping over all the partitions
        for (const partition of partitions) {
          const savedOffset = lastProcessedOffsets[partition];
          if (savedOffset) {
            // Start from the next offset after the last processed one
            const nextOffset = BigInt(savedOffset) + BigInt(1);
            console.log(
              `Seeking topic ${topic} partition ${partition} to offset ${nextOffset}`
            );
            // seekOperations.push(
            consumer.seek({
              topic,
              partition,
              offset: nextOffset.toString(),
            });
            // );
          } else {
            console.log(
              `No snapshot offset found for partition ${partition}. Starting from beginning.`
            );
            // seekOperations.push(
            consumer.seek({ topic, partition, offset: "0" });
            // );
          }
        }
      }
    });
  } else {
    console.log(
      "No snapshot found. Consumer will start based on 'fromBeginning' setting."
    );
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

    const consumer = kafkaClient.consumer({
      groupId: "order-group",
    });

    await consumer.connect();
    await loadSnapshotAndSeek(consumer);

    await consumer.subscribe({
      topic: ORDER_TOPIC,
      fromBeginning: true,
    });

    await consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message }) => {
        const val = message.value?.toString() || "";
        const parsed = JSON.parse(val);

        console.log("Received message:", parsed);

        if (!parsed) {
          return;
        }

        switch (parsed.type) {
          case EVENT_TYPE.USER_REGISTER: {
            const { email, balance } = parsed;
            appState.Users.set(email, {
              balance,
              lockedBalance: 0,
              assets: {},
              BorrowedAssets: {},
            });
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
              !appState.assetPrice.has(asset) ||
              !leverage ||
              !qty ||
              slippage < 0 ||
              !email
            ) {
              console.log("Invalid Parameter");
              break;
            }

            if (!appState.Users.has(email)) {
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

            let amountToLock = margin;

            lockBalance(email, amountToLock);

            if (side === "LONG") {
              addAsset(email, asset, qty);

              appState.orders.set(orderId, {
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

              if (!appState.mappedOrderswithUser.has(email)) {
                appState.mappedOrderswithUser.set(email, []);
              }

              appState.mappedOrderswithUser.get(email)?.push(orderId);

              const leveragedPriceLimit = getLeveragedPriceLimit(
                side,
                leverage,
                actualPriceForAnAsset
              );

              if (!appState.maxHeapForLongLiquation.has(asset)) {
                appState.maxHeapForLongLiquation.set(
                  asset,
                  new Heap<HeapItem>(
                    (a, b) => b.liquidationPrice - a.liquidationPrice
                  )
                );
              }
              appState.maxHeapForLongLiquation.get(asset)?.push({
                liquidationPrice: leveragedPriceLimit,
                orderId,
              });
            } else {
              // For Short orders , mocking the functionality of borrowing the assets and then to sell

              // get the asset
              addBorrowedAsset(email, asset, qty);

              // Liquidate the asset immediately to get the USD equivalent
              liquidateBorrowedAsset(email, asset, qty, fullPrice);

              appState.orders.set(orderId, {
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

              if (!appState.mappedOrderswithUser.has(email)) {
                appState.mappedOrderswithUser.set(email, []);
              }

              appState.mappedOrderswithUser.get(email)?.push(orderId);

              const leveragedPriceLimit = getLeveragedPriceLimit(
                side,
                leverage,
                actualPriceForAnAsset
              );

              if (!appState.minHeapForShortLiquidation.has(asset)) {
                appState.minHeapForShortLiquidation.set(
                  asset,
                  new Heap<HeapItem>(
                    (a, b) => a.liquidationPrice - b.liquidationPrice
                  )
                );
              }

              appState.minHeapForShortLiquidation.get(asset)?.push({
                liquidationPrice: leveragedPriceLimit,
                orderId,
              });
            }
            // orders.set(orderId, { asset, side, margin, leverage, slippage });
            // Map order to user if needed
            console.log("Order Created:", orderId, asset, side);
            break;
          }

          case EVENT_TYPE.ORDER_CANCELLED: {
            const { msgId: orderId } = parsed;
            const order = appState.orders.get(orderId);
            if (order) {
              unlockBalance(order.email, order.margin);
              appState.orders.delete(orderId);
            }
            break;
          }

          case EVENT_TYPE.ORDER_CLOSED: {
            const { orderId, email } = parsed;
            appState.orders.delete(orderId);
            console.log("Order Closed:", orderId);
            break;
          }

          case EVENT_TYPE.PRICE_UPDATE: {
            const { SOL_PRICE, BTC_PRICE, ETH_PRICE } = parsed;
            console.log("Price Update:", { SOL_PRICE, BTC_PRICE, ETH_PRICE });
            appState.assetPrice.set(ASSET.SOL, SOL_PRICE);
            appState.assetPrice.set(ASSET.BTC, BTC_PRICE);
            appState.assetPrice.set(ASSET.ETH, ETH_PRICE);

            Array.from(appState.assetPrice.keys()).forEach((asset) => {
              console.log(
                `Current price of ${asset}:`,
                appState.assetPrice.get(asset)
              );

              while (
                (appState.maxHeapForLongLiquation.get(asset)?.size() || 0) > 0
              ) {
                const top = appState.maxHeapForLongLiquation.get(asset)?.peek();
                if (
                  top &&
                  appState.assetPrice.get(asset) !== undefined &&
                  appState.assetPrice.get(asset)! <= top.liquidationPrice
                ) {
                  const liquidatedOrder = appState.maxHeapForLongLiquation
                    .get(asset)
                    ?.pop();
                  if (liquidatedOrder) {
                    const order = appState.orders.get(liquidatedOrder.orderId);
                    if (!order) {
                      continue;
                    }
                    const { qty, boughtPrice, margin, email } = order;
                    let pnl = 0;

                    pnl = getCurrentPrice(asset) * qty - boughtPrice;

                    // unlock balance
                    unlockBalance(email, margin);

                    // Update user balance
                    const user = appState.Users.get(email);
                    if (user) {
                      user.balance += pnl;
                    }

                    const orderDetails = appState.orders.get(
                      liquidatedOrder.orderId
                    );

                    if (orderDetails) {
                      console.log(
                        "Order Liquidated due to price drop:",
                        liquidatedOrder.orderId
                      );
                      appState.orders.delete(liquidatedOrder.orderId);
                      appState.CLOSED_ORDERS.set(liquidatedOrder.orderId, {
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

              while (
                (appState.minHeapForShortLiquidation.get(asset)?.size() || 0) >
                0
              ) {
                const top = appState.minHeapForShortLiquidation
                  .get(asset)
                  ?.peek();
                if (
                  top &&
                  appState.assetPrice.get(asset) !== undefined &&
                  appState.assetPrice.get(asset)! >= top.liquidationPrice
                ) {
                  const liquidatedOrder = appState.minHeapForShortLiquidation
                    .get(asset)
                    ?.pop();
                  if (liquidatedOrder) {
                    const order = appState.orders.get(liquidatedOrder.orderId);
                    if (!order) {
                      continue;
                    }
                    const { qty, boughtPrice, margin, email, asset } = order;

                    const user = appState.Users.get(email);

                    if (
                      !user ||
                      !user.balance ||
                      user.balance <= 0 ||
                      !user.BorrowedAssets ||
                      !user.BorrowedAssets[asset]
                    ) {
                      console.log("User has no balance to buy back the asset");
                      continue;
                    }

                    // Here bought The asset
                    const priceOfAsset = getCurrentPrice(asset) * qty;

                    user.balance -= priceOfAsset;

                    // Bough the asset back to return the borrowed asset
                    // addAsset(email, asset, qty);
                    user.BorrowedAssets[asset] -= qty;

                    // if (user.BorrowedAssets[asset] <= 0) {
                    //   delete user.BorrowedAssets[asset];
                    // }

                    let pnl = 0;

                    pnl = boughtPrice - priceOfAsset;
                    let balanceToReturn = margin + pnl;

                    // unlock balance
                    unlockBalance(email, margin);

                    // Update user balance
                    if (user) {
                      user.balance += pnl;
                    }

                    const orderDetails = appState.orders.get(
                      liquidatedOrder.orderId
                    );

                    if (orderDetails) {
                      console.log(
                        "Order Liquidated due to price rise:",
                        liquidatedOrder.orderId
                      );
                      appState.orders.delete(liquidatedOrder.orderId);
                      appState.CLOSED_ORDERS.set(liquidatedOrder.orderId, {
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

            const balance = appState.Users.get(email)?.balance;

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

            const totalAssets = appState.Users.get(email)?.BorrowedAssets || {};

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

        const currentTime = Date.now();
        if (currentTime - lastSnapShotTime > SNAPSHOT_INTERVAL_MS) {
          await saveSnapShot(lastProcessedOffsets, appState);
          lastSnapShotTime = currentTime;
        }

        await consumer.commitOffsets([
          {
            topic,
            partition,
            offset: (BigInt(message.offset) + 1n).toString(),
          },
        ]);
      },
    });
  } catch (error) {
    console.log("Error In engine", error);
  }
}

main();
