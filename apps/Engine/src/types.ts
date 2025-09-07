import Heap from "heap-js";

export type PartitionOffsetMap = Record<number, string>;

export enum ASSET {
  BTC = "BTC",
  ETH = "ETH",
  SOL = "SOL",
}

export type Asset = keyof typeof ASSET;

export type HeapItem = { liquidationPrice: number; orderId: string };

export type UserData = {
  balance: number;
  assets: Record<string, number>;
  lockedBalance: number;
  BorrowedAssets: Record<string, number>;
};

export type OrderDetails = {
  asset: Asset;
  side: "LONG" | "SHORT";
  qty: number;
  margin: number;
  leverage: number;
  slippage: number;
  email: string;
  boughtPrice: number; // Total price paid for the asset at the time of buying
  status: "OPEN" | "CLOSED" | "LIQUIDATED";
};

export type ClosedOrderDetails = OrderDetails & {
  pnl: number; // Profit and Loss
};

export type AppState = {
  Users: Map<string, UserData>;
  orders: Map<string, OrderDetails>;
  mappedOrderswithUser: Map<string, string[]>;
  assetPrice: Map<Asset, number>;
  maxHeapForLongLiquation: Map<string, Heap<HeapItem>>;
  minHeapForShortLiquidation: Map<string, Heap<HeapItem>>;
  CLOSED_ORDERS: Map<string, any>;
};

export interface IApplicationSnapShot {
  // As we consuming from a single topic, then we only need to store the offsets of the partitions of that topic
  lastProcessedBlock: PartitionOffsetMap;
  state: {
    users: [string, UserData][];
    orders: [string, OrderDetails][];
    mappedOrderswithUser: [string, string[]][];
    assetPrice: [Asset, number][];
    closedOrders: [string, ClosedOrderDetails][];
    maxHeapForLongLiquation: { liquidationPrice: number; orderId: string }[];
    minHeapForShortLiquidation: { liquidationPrice: number; orderId: string }[];
  };
}
