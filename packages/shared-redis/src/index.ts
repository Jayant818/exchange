import { createClient, RedisClientType, RedisClientType as RedisType } from "redis";

export class RedisManager {
  private static standardClient: RedisType;
  private static subscriberClient: RedisType;

  private constructor() {}

  private static async createClient(): Promise<RedisType> {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

    const client = createClient({ url: redisUrl });
    await client.connect();
    // @ts-ignore
    return client;
  }

  public static async getStandardClient(): Promise<RedisType> {
    if (!RedisManager.standardClient) {
      RedisManager.standardClient = await this.createClient();
    }

    return RedisManager.standardClient;
  }

  public static async getSubscriberClient(): Promise<RedisType> {
    if (!RedisManager.subscriberClient) {
      RedisManager.subscriberClient = await this.createClient();
    }

    return RedisManager.subscriberClient;
  }
}

let redis : RedisClientType;
let publisher : RedisClientType;
let subscriber:RedisClientType;

async function main() {
  redis = await RedisManager.getStandardClient();
  publisher = redis;
  subscriber = await RedisManager.getSubscriberClient();
}

main();

export { redis, publisher, subscriber };
