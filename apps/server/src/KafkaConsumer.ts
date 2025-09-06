import { Consumer, Kafka } from "kafkajs";

export class KafkaConsumer {
  static instance: KafkaConsumer;
  consumer: Consumer;
  callbacks: Record<string, () => void> = {};

  private constructor() {
    const kafka = new Kafka({
      clientId: "my-app",
      brokers: ["localhost:9092"],
    });

    this.consumer = kafka.consumer({ groupId: "order-group" });
    this.consumer.connect();
  }

  static getInstance() {
    if (!KafkaConsumer.instance) {
      KafkaConsumer.instance = new KafkaConsumer();
    }
    return KafkaConsumer.instance;
  }

  async listenToTopic(topic: string) {
    await this.consumer.subscribe({ topic, fromBeginning: true });

    await this.consumer.run({
      eachMessage: async (message) => {
        console.log(`Received message: ${message.message.value?.toString()}`);
        const val = message.message.value?.toString() || "";
        const parsed = JSON.parse(val);
        const id = parsed.orderId;
        if (this.callbacks[id]) {
          this.callbacks[id]();
          delete this.callbacks[id];
        }
      },
    });
  }

  addCallBack(id: string) {
    return new Promise((res) => {
      this.callbacks[id] = () => {
        res(true);
      };
    });
  }
}
