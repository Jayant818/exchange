import express from "express";
import * as jwt from "jsonwebtoken";
import "dotenv/config";
import nodemailer from "nodemailer";
import { KafkaProducer } from "@repo/shared-kafka";
import { createClient } from "redis";
import prismaClient from "@repo/db";
import { ENGINE_TO_SERVER, EVENT_TYPE, ORDER_TOPIC } from "@repo/constants";
import crypto from "crypto";
import { KafkaConsumer } from "./KafkaConsumer";

let message = {
  to: "",
  subject: "Login using MagicLink",
  html: "",
};

function createToken(email: string) {
  const secret = process.env.TOKEN_SECRET;

  if (!secret || secret === undefined) {
    return null;
  }

  const token = jwt.sign({ email }, secret!, {
    expiresIn: "1h",
  });

  return token;
}

const ACCESS_TOKEN = "";
const REFRESH_TOKEN = "";

async function main() {
  const app = express();
  const FRONTEND_URL = process.env.FRONTEND_URL;
  const port = 3001;

  app.use(express.json());

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

  async function sendLoginMail(email: string, token: string) {
    try {
      let htmlBody = `Click <a href="http://localhost:3001/verify?id=${token}">here</a> to verify your email.`;
      message.html = htmlBody;
      message.to = email;

      transporter.sendMail(message, (err: any, info: any) => {
        if (err) {
          console.log("Error occurred");
          console.log(err.message);
          return;
        }
        console.log("Message sent successfully!");
        console.log('Server responded with "%s"', info.response);
      });
    } catch (e) {
      console.log("Error occurred while sending email");
      console.log(e);
    }
  }

  app.get("/", (req, res) => {
    res.send("Server is running");
  });

  app.post("/api/v1/signup", async (req, res) => {
    try {
      const { email } = req.body;
      const id = crypto.randomUUID();
      if (!email || email === " ") {
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

      await sendLoginMail(email, token);

      return res.status(200).json({ message: "Signup successful" });
    } catch (e) {
      console.log("Error", e);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.post("/api/v1/signin", async (req, res) => {
    const { email } = req.body;

    if (!email) {
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

    await sendLoginMail(email, token!);

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

      await KafkaConsumer.getInstance().addCallBack(msgId);
      console.log("HIT4");

      res.cookie("token", verifiedToken);
      return res.redirect("http://localhost:3000/verified");
    } catch (error) {}
  });

  app.post("/api/callback", (req, res) => {
    console.log(req.body);
  });

  app.post("/api/v1/trade/create", async (req, res) => {
    try {
      // Price here needs to be full price of the order that we want to take place
      // Here we are simulating frontend otherwise we will get email from the token
      const { asset, side, qty, leverage, slippage, email, price } = req.body;

      if (!asset || !side || !qty || !leverage || !slippage || !price) {
        return res.status(400).json({ message: "Invalid Trade Parameters" });
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

      await KafkaConsumer.getInstance().addCallBack(msgId);

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

      await KafkaConsumer.getInstance().addCallBack(orderId);

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

      let data: any = await KafkaConsumer.getInstance().addCallBack(msgId);

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

      const data: any = await KafkaConsumer.getInstance().addCallBack(msgId);

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

      const data: any = await KafkaConsumer.getInstance().addCallBack(msgId);

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

  app.listen(port, () => {
    console.log("Server is running on http://localhost:" + port);
  });
}

main();
