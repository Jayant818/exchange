import express from "express";
import * as jwt from "jsonwebtoken";
import "dotenv/config";
import { EVENT_TYPE, ORDER_TOPIC } from "@repo/constants";
import crypto from "crypto";
import { Transporter } from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import { Consumer, Producer } from "kafkajs";
import { createToken, sendLoginMail } from "./utils";
import { PrismaClient } from "@prisma/client/extension";
import { KafkaConsumer } from "./KafkaConsumer";

let message = {
  to: "",
  subject: "Login using MagicLink",
  html: "",
};

const SUPPORTED_ASSETS = ["BTC", "SOL", "ETH"];
const SIDES = ["SHORT", "LONG"];

function createApp({
  transporter,
  producer,
  prismaClient,
  consumer,
}: {
  transporter: Transporter<
    SMTPTransport.SentMessageInfo,
    SMTPTransport.Options
  >;
  producer: Producer;
  prismaClient: PrismaClient;
  consumer: typeof KafkaConsumer;
}) {
  const app = express();
  const FRONTEND_URL = process.env.FRONTEND_URL;

  app.use(express.json());

  app.get("/", (req, res) => {
    res.send("Server is running");
  });

  app.post("/api/v1/signup", async (req, res) => {
    try {
      const { email } = req.body;
      const id = crypto.randomUUID();
      if (!email || email === " " || !email.includes("@")) {
        return res.status(400).json({ message: "Invalid email" });
      }

      const token = createToken(email);

      if (!token) {
        return res.status(400).json({ message: "Error while creating token " });
      }

      const user = await prismaClient.user.create({
        data: {
          email,
          verified: false,
        },
      });

      await sendLoginMail(email, token, transporter, message);

      return res.status(200).json({ message: "Signup successful" });
    } catch (e) {
      console.log("Error", e);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.post("/api/v1/signin", async (req, res) => {
    const { email } = req.body;

    if (!email || !email.includes("@")) {
      return res.status(400).json({
        message: "Invalid Email",
      });
    }

    const user = await prismaClient.user.findUnique({
      where: {
        email,
      },
    });

    if (!user) {
      return res.status(400).send("User not found");
    }

    const token = createToken(email);

    await sendLoginMail(email, token!, transporter, message);

    if (!token) {
      res.status(400).json({ message: "Error while creating token " });
    }

    return res
      .status(200)
      .json({ message: "Mail is successfully sent to your email" });
  });

  app.get("/verify", async (req, res) => {
    try {
      console.log("HIT");
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ messsage: "Invalid URL" });
      }

      const secret = process.env.TOKEN_SECRET;

      if (!secret || secret === undefined) {
        return res.status(400).json({
          message: "jsonsecret not found",
        });
      }

      const verifiedToken = jwt.verify(id.toString(), secret) as {
        email: string;
      };

      if (!verifiedToken.email) {
        return res.status(400).json({ message: "Invalid Token" });
      }

      await prismaClient.user.update({
        where: {
          email: verifiedToken.email,
        },
        data: {
          verified: true,
        },
      });

      const msgId = crypto.randomUUID();

      console.log("HIT2");

      await producer.send({
        topic: ORDER_TOPIC,
        messages: [
          {
            value: JSON.stringify({
              type: EVENT_TYPE.USER_REGISTER,
              email: verifiedToken.email,
              balance: 500000,
              msgId,
            }),
          },
        ],
      });

      console.log("HIT3");

      await consumer.getInstance().addCallBack(msgId);
      console.log("HIT4");

      res.cookie("token", verifiedToken);
      return res.redirect("http://localhost:3000/verified");
    } catch (error) {}
  });

  app.post("/api/v1/trade/create", async (req, res) => {
    try {
      // Price here needs to be full price of the order that we want to take place
      // Here we are simulating frontend otherwise we will get email from the token
      const { asset, side, qty, leverage, slippage, email, price } = req.body;

      if (
        !asset ||
        !side ||
        !qty ||
        !leverage ||
        !slippage ||
        !price ||
        !SUPPORTED_ASSETS.includes(asset) ||
        leverage <= 0 ||
        price <= 0 ||
        !SIDES.includes(side) ||
        !email ||
        !email.includes("@")
      ) {
        return res.status(400).json({ message: "Invalid Trade Parameters" });
      }

      const user = await prismaClient.user.findUnique({
        where: {
          email,
        },
      });

      if (!user) {
        return res.status(400).send("User not found");
      }

      const msgId = crypto.randomUUID();

      await producer.send({
        topic: ORDER_TOPIC,
        messages: [
          {
            value: JSON.stringify({
              type: EVENT_TYPE.ORDER_CREATED,
              asset,
              side,
              qty,
              leverage,
              slippage,
              price,
              msgId,
              email,
            }),
          },
        ],
      });

      // await consumer.getInstance().addCallBack(msgId);

      return res
        .status(200)
        .json({ message: "Order Placed Successfully", orderId: msgId });
    } catch (error) {
      return res.status(400).json({
        message: "Error Creating Order",
      });
    }
  });

  app.post("/api/v1/trade/close", async (req, res) => {
    try {
      const { orderId, email } = req.body;

      if (
        !orderId ||
        !email ||
        !email.includes("@") ||
        typeof orderId !== "string"
    ) {
        return res.status(400).json({ message: "Invalid Request" });
      }

      const user = await prismaClient.user.findUnique({
        where: {
          email,
        },
      });

      if (!user) {
        return res.status(400).send("User not found");
      }

      await producer.send({
        topic: ORDER_TOPIC,
        messages: [
          {
            value: JSON.stringify({
              type: EVENT_TYPE.ORDER_CLOSED,
              orderId,
              email,
            }),
          },
        ],
      });

      // await consumer.getInstance().addCallBack(orderId);

      return res.status(200).json({
        message: "Position Closed successfull",
        orderId,
      });
    } catch (error) {
      return res.status(400).json({
        message: "Error closing position",
      });
    }
  });

  app.get("/api/v1/balance/usd", async (req, res) => {
    try {
      const email = req.query.email;
      const msgId = crypto.randomUUID();

      await producer.send({
        topic: ORDER_TOPIC,
        messages: [
          {
            value: JSON.stringify({
              type: EVENT_TYPE.BALANCE_CHECK_USD,
              msgId,
              email,
            }),
          },
        ],
      });

      let data: any = await consumer.getInstance().addCallBack(msgId);

      return res.status(200).json({
        balance: data.balance,
      });
    } catch (error) {
      res.status(400).json({
        message: "Error Fetching USD Balance",
      });
    }
  });

  app.get("/api/v1/balance", async (req, res) => {
    try {
      const email = req.query.email;
      const msgId = crypto.randomUUID();

      await producer.send({
        topic: ORDER_TOPIC,
        messages: [
          {
            value: JSON.stringify({
              type: EVENT_TYPE.FULL_BALANCE_CHECK,
              msgId,
              email,
            }),
          },
        ],
      });

      const data: any = await consumer.getInstance().addCallBack(msgId);

      return res.status(200).json({
        message: "Balance fetched successfully",
        balance: data.balance,
      });
    } catch (error) {
      res.status(400).json({
        message: "Error Fetching Balance",
      });
    }
  });

  app.get("/api/v1/supportedAssets", async (req, res) => {
    try {
      const msgId = crypto.randomUUID();

      await producer.send({
        topic: ORDER_TOPIC,
        messages: [
          {
            value: JSON.stringify({
              type: EVENT_TYPE.SUPPORTED_ASSETS,
              msgId,
            }),
          },
        ],
      });

      const data: any = await consumer.getInstance().addCallBack(msgId);

      return res.status(200).json({
        message: "Assets fetched successfully",
        assets: data.assets,
      });
    } catch (error) {
      res.status(400).json({
        message: "Error Fetching Assets ",
      });
    }
  });

  return app;
}

export default createApp;
