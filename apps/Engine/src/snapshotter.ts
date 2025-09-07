import Heap from "heap-js";
import { AppState, HeapItem } from "./types";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "./s3client";

const BUCKET_NAME = "my-trading-engine-snapshot-bucket";
const LATEST_SNAPSHOT_KEY = "latest_snapshot.json";

export interface ISnapshotData {
  lastProcessedOffsets: Record<number, string>;
  state: any;
}

export function serialize(state: AppState) {
  return {
    users: [...state.Users.entries()],
    orders: [...state.orders.entries()],
    mappedOrderswithUser: [...state.mappedOrderswithUser.entries()],
    assetPrice: [...state.assetPrice.entries()],
    closedOrders: [...state.CLOSED_ORDERS.entries()],
    longLiquidationHeap: [...state.maxHeapForLongLiquation], // heap → array
    shortLiquidationHeap: [...state.minHeapForShortLiquidation],
  };
}

export function deserialize(snapshotState: any): AppState {
  const maxHeap = new Heap<{ liquidationPrice: number; orderId: string }>(
    (a, b) => b.liquidationPrice - a.liquidationPrice
  );
  snapshotState.longLiquidationHeap.forEach((item: HeapItem) =>
    maxHeap.push(item)
  );

  const minHeap = new Heap<{ liquidationPrice: number; orderId: string }>(
    (a, b) => a.liquidationPrice - b.liquidationPrice
  );
  snapshotState.shortLiquidationHeap.forEach((item: HeapItem) =>
    minHeap.push(item)
  );

  return {
    Users: new Map(snapshotState.users),
    orders: new Map(snapshotState.orders),
    mappedOrderswithUser: new Map(snapshotState.mappedOrderswithUser),
    assetPrice: new Map(snapshotState.assetPrice),
    CLOSED_ORDERS: new Map(snapshotState.closedOrders),
    maxHeapForLongLiquation: maxHeap,
    minHeapForShortLiquidation: minHeap,
  };
}

export async function uploadSnapShotToS3(
  snapShotData: ISnapshotData,
  fileName: string
) {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: JSON.stringify(snapShotData, null, 2),
      ContentType: "application/json",
    });

    await s3Client.send(command);
    console.log(`Snapshot uploaded successfully to S3: ${fileName}`);
  } catch (error) {
    console.error("Error uploading snapshot to S3:", error);
    throw error;
  }
}

export async function downloadSnapShotFromS3(
  fileName: string
): Promise<ISnapshotData | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName,
    });

    const response = await s3Client.send(command);

    if (response.Body) {
      const data = await response.Body.transformToString();
      return JSON.parse(data) as ISnapshotData;
    }
    return null;
  } catch (error) {
    console.error("Error downloading snapshot from S3:", error);
    return null; // safer than throwing → caller can handle missing snapshot
  }
}

export async function saveSnapShot(
  offsets: Record<number, string>,
  state: AppState
): Promise<void> {
  try {
    const snapshotData: ISnapshotData = {
      lastProcessedOffsets: offsets,
      state: serialize(state),
    };

    // Upload timestamped snapshot (for history)
    await uploadSnapShotToS3(
      snapshotData,
      `snapshots/snapshot_${Date.now()}.json`
    );

    // Also upload/update the latest snapshot
    await uploadSnapShotToS3(snapshotData, LATEST_SNAPSHOT_KEY);

    console.log("Snapshot saved successfully at offsets:", offsets);
  } catch (error) {
    console.error("Error saving snapshot:", error);
  }
}

export async function loadSnapShot(): Promise<ISnapshotData | null> {
  try {
    const data = await downloadSnapShotFromS3(LATEST_SNAPSHOT_KEY);
    if (!data) {
      console.warn("No snapshot found in S3.");
      return null;
    }
    return data;
  } catch (error) {
    console.error("Error loading snapshot:", error);
    return null;
  }
}
