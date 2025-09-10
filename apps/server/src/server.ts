import { ENGINE_TO_SERVER } from "@repo/common";
import { KafkaProducer } from "@repo/shared-kafka";
import { KafkaConsumer } from "./KafkaConsumer";
import nodemailer from "nodemailer";
import createApp from ".";
import prismaClient from "@repo/db";

const port = 3001;

async function main() {
  let transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "yadavjayant2003@gmail.com",
      pass: process.env.APP_PASSWORD,
    },
  });

  await KafkaProducer.getInstance().connect();

  const producer = KafkaProducer.getInstance().getProducer();

  KafkaConsumer.getInstance().listenToTopic(ENGINE_TO_SERVER);

  const app = createApp({
    transporter,
    producer,
    prismaClient,
    consumer: KafkaConsumer,
  });

  app.listen(port, () => {
    console.log("Server is running on http://localhost:" + port);
  });
}

main();
