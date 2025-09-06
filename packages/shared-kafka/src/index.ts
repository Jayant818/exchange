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
    this.producer.connect();
  }

  static getInstance() {
    if (!KafkaProducer.instance) {
      KafkaProducer.instance = new KafkaProducer();
    }
    return KafkaProducer.instance;
  }

  getProducer() {
    return this.producer;
  }
}
