import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import createApp from "..";
import { mockDeep } from "vitest-mock-extended";
import { PrismaClient } from "@prisma/client/extension";

// const fakePrisma = {
//   user: {
//     create: vi.fn().mockResolvedValue({ id: "1", email: "x@gmail.com" }),
//     findUnique: vi.fn(), // we’ll override in each test
//   },
// };

// using deepmock
const fakeMailer = {
  sendMail: vi.fn(),
};

const fakeProducer = {
  send: vi.fn(),
};

const fakeConsumer = {
  addCallBack: vi.fn(),
};

const fakePrisma = mockDeep<PrismaClient>();

const app = createApp({
  transporter: fakeMailer as any,
  prismaClient: fakePrisma,
  producer: fakeProducer as any,
  consumer: fakeConsumer as any,
});

describe("Signup Route", () => {
  beforeEach(() => {
    // Either do this inside it or in beforeEach
    fakePrisma.user.create.mockResolvedValue({
      id: "1",
      email: "x@gmail.com",
    });
  });

  it("should successfully signup a user", async () => {
    const res = await request(app).post("/api/v1/signup").send({
      email: "yadavjayant2003@gmail.com",
    });

    expect(res.status).toBe(200);
  });

  it("Should return error", async () => {
    const res = await request(app).post("/api/v1/signup").send({
      email: "",
    });

    expect(res.status).toBe(400);
  });
});

describe("SignIn Route", () => {
  it("Should successfully sent the email", async () => {
    fakePrisma.user.findUnique.mockResolvedValue({
      id: "1",
      email: "x@gmail.com",
    });
    const res = await request(app).post("/api/v1/signin").send({
      email: "x@gmail.com",
    });

    expect(res.status).toBe(200);
  });

  it("Should return error as user user doesn't exist", async () => {
    fakePrisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app).post("/api/v1/signin").send({
      email: "abc@gmail.com",
    });

    expect(res.status).toBe(400);
  });

  it("should throw error as email is invalid", async () => {
    fakePrisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app).post("/api/v1/signin").send({
      email: "jayantgmail.com",
    });
    expect(res.status).toBe(400);
  });
});

describe("Create Order Route", () => {
  it("should throw error as trade parameters are invalid", async () => {
    const res = await request(app).post("/api/v1/trade/create").send({
      asset: "BTC",
      side: "BUY",
      qty: "4",
      leverage: 1,
      slippage: 100,
      price: 10,
      email: "x@gmail.com",
    });

    expect(res.status).toBe(400);
  });

  it("should throw error as trade parameters are invalid", async () => {
    const res = await request(app).post("/api/v1/trade/create").send({
      asset: "BTC",
      side: "LONG",
      qty: "4",
      leverage: 1,
      slippage: 100,
      price: 0,
      email: "x@gmail.com",
    });

    expect(res.status).toBe(400);
  });

  it("should create the order", async () => {
    fakePrisma.user.findUnique.mockResolvedValue({
      id: "1",
      email: "x@gmail.com",
    });

    const res = await request(app).post("/api/v1/trade/create").send({
      asset: "BTC",
      side: "LONG",
      qty: 4,
      leverage: 10,
      slippage: 100,
      price: 100,
      email: "x@gmail.com",
    });

    expect(res.status).toBe(200);
  });
});

describe("Close Order", () => {
  it("should throw error as User Doesn't exist", async () => {
    fakePrisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app).post("/api/v1/trade/close").send({
      orderId: 10,
      email: "xyz@gmail.com",
    });

    expect(res.status).toBe(400);
  });

  it("should throw error as orderId is a number", async () => {
    fakePrisma.user.findUnique.mockResolvedValue({
      id: "1",
      email: "x@gmail.com",
    });
    const res = await request(app).post("/api/v1/trade/close").send({
      orderId: 111,
      email: "x@gmail.com",
    });

    expect(res.status).toBe(400);
  });

  it("should close the order", async () => {
    fakePrisma.user.findUnique.mockResolvedValue({
      id: "1",
      email: "x@gmail.com",
    });

    const res = await request(app).post("/api/v1/trade/close").send({
      orderId: "10",
      email: "x@gmail.com",
    });

    expect(res.status).toBe(200);
  });
});
