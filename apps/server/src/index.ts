import express from "express";
import * as jwt from "jsonwebtoken";
import "dotenv/config";
import nodemailer from "nodemailer";
import { KafkaProducer } from "@repo/shared-kafka";
import { createClient } from "redis";
import prismaClient from "@repo/db";
import { USER_REGISTER_TOPIC } from "@repo/constants";

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

async function sendAndAwait(topic: string, message: any) {
  return new Promise(async (res) => {
    const SubscriberClient = await createClient().connect();

    const producer = KafkaProducer.getInstance().getProducer();

    SubscriberClient.subscribe(message.orderId, (msg) => {
      console.log("Received message:", msg);

      res("Resolved");
    });

    await producer.send({
      messages: [
        {
          value: JSON.stringify(message),
        },
      ],
      topic,
    });
  });
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

      const user = await prismaClient.user.update({
        where: {
          email: verifiedToken.email,
        },
        data: {
          verified: true,
        },
      });

      const producer = KafkaProducer.getInstance().getProducer();

      await producer.send({
        topic: USER_REGISTER_TOPIC,
        messages: [
          {
            value: JSON.stringify({
              email: verifiedToken.email,
              balance: 500000,
            }),
          },
        ],
      });

      res.cookie("token", verifiedToken);
      return res.redirect("http://localhost:3000/verified");
    } catch (error) {}
  });

  app.post("/api/callback", (req, res) => {
    console.log(req.body);
  });

  app.post("/api/v1/trade/create", (req, res) => {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ message: "Invalid Order" });
    }

    sendAndAwait("order", {
      orderId: id,
      type: "buy",
    });

    return res.status(200).json({ message: "Order Placed Successfully" });
  });

  app.delete("/api/v1/trade/delete", (req, res) => {});

  app.get("/api/v1/balance", (req, res) => {});

  app.listen(port, () => {
    console.log("Server is running on http://localhost:" + port);
  });
}

main();
