export const USER_REGISTER_TOPIC = "user-register-topic";
export const ORDER_TOPIC = "orders";
export const CURRENT_PRICE_TOPIC = "current_price";
export const PRICE_UPDATE_CHANNEL = "price_update";
export const ENGINE_TO_SERVER = "engine_to_server";

export enum EVENT_TYPE {
  USER_REGISTER = "USER_REGISTER",
  ORDER_CREATED = "ORDER_CREATED",
  ORDER_CANCELLED = "ORDER_CANCELLED",
  PRICE_UPDATE = "PRICE_UPDATE",
  ORDER_CLOSED = "ORDER_CLOSED",
  BALANCE_CHECK_USD = "BALANCE_CHECK_USD",
  FULL_BALANCE_CHECK = "FULL_BALANCE_CHECK",
  SUPPORTED_ASSETS = "SUPPORTED_ASSETS",
}

export const POLLING_ENGINE_EVENT_CHANNEL = "polling-channel-for-events";

export const BINANCE_WS_URL = "wss://stream.binance.com:9443/stream?streams=";
//stream.binance.com:9443/stream?streams=btcusdt@trade

export const POLLING_ENGINE_DATA_CHANNEL = "polling-engine-data-channel";

export const POLLING_ENGINE_QUEUE_NAME = "polling-engine-queue";

export const MARKET_TRADE_CHANNELS = "market_trade_channels";

export const SIMULATOR_MARGIN = 5; //5% margin

export const TRADE_KEY = "trade_key";

export const MESSAGE_QUEUE = "email_queue";
