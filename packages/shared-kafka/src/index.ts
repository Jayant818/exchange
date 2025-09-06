import { Kafka } from "kafkajs";

export class KafkaProducer {
  private static instance: KafkaProducer;
  private producer: any;

  private constructor() {
    const kafka = new Kafka({
      clientId: "my-app",
      brokers: ["localhost:9092"],
    });

    this.producer = kafka.producer();
  }

  static getInstance() {
    if (!KafkaProducer.instance) {
      KafkaProducer.instance = new KafkaProducer();
    }
    return KafkaProducer.instance;
  }

  async connect() {
    try {
      await this.producer.connect();
    } catch (error) {
      console.error("Error connecting Kafka producer:", error);
    }
  }

  getProducer() {
    return this.producer;
  }
}
