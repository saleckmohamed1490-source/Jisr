import { describe, expect, it, beforeAll } from "vitest";
import { createHmac } from "node:crypto";
import { nowPaymentsProvider, signIpnPayload, sortKeysDeep } from "@/lib/payments/nowpayments";
import { WebhookSignatureError } from "@/lib/payments/types";
import { explorerUrl } from "@/lib/payments/currencies";

const SECRET = "test-ipn-secret";
beforeAll(() => {
  process.env.NOWPAYMENTS_IPN_SECRET = SECRET;
});

const ipn = {
  payment_id: 5077125051,
  invoice_id: 4522625843,
  payment_status: "finished",
  pay_address: "TXyz",
  price_amount: 19,
  price_currency: "usd",
  pay_amount: 19.21,
  actually_paid: 19.21,
  pay_currency: "usdttrc20",
  order_id: "ac_test_1",
  order_description: "AdCheck pro",
  purchase_id: "5837122679",
  outcome_amount: 18.9,
  outcome_currency: "usdttrc20",
  fee: { currency: "usdttrc20", depositFee: 0, withdrawalFee: 0, serviceFee: 0.1 },
  payin_hash: "abc123",
};

const headers = (sig: string) => new Headers({ "x-nowpayments-sig": sig });

describe("NOWPayments IPN signature", () => {
  it("sorts keys recursively", () => {
    expect(JSON.stringify(sortKeysDeep({ b: 1, a: { d: 1, c: [{ z: 1, y: 2 }] } }))).toBe('{"a":{"c":[{"y":2,"z":1}],"d":1},"b":1}');
  });

  it("matches HMAC-SHA512 over the key-sorted JSON", () => {
    const sorted = JSON.stringify(sortKeysDeep(ipn));
    const manual = createHmac("sha512", SECRET).update(sorted).digest("hex");
    expect(signIpnPayload(ipn, SECRET)).toBe(manual);
  });

  it("accepts a valid signature regardless of the body's key order", () => {
    const raw = JSON.stringify({ ...ipn, order_id: ipn.order_id }); // different key order than sorted
    const u = nowPaymentsProvider.parseWebhook(raw, headers(signIpnPayload(ipn, SECRET)));
    expect(u).toMatchObject({
      orderId: "ac_test_1",
      providerPaymentId: "5077125051",
      status: "finished",
      priceAmount: 19,
      priceCurrency: "usd",
      payCurrency: "usdttrc20",
      actuallyPaid: 19.21,
      txHash: "abc123",
    });
  });

  it("rejects missing, wrong or tampered signatures", () => {
    const raw = JSON.stringify(ipn);
    const good = signIpnPayload(ipn, SECRET);
    expect(() => nowPaymentsProvider.parseWebhook(raw, new Headers())).toThrow(WebhookSignatureError);
    expect(() => nowPaymentsProvider.parseWebhook(raw, headers("00" + good.slice(2)))).toThrow(WebhookSignatureError);
    expect(() => nowPaymentsProvider.parseWebhook(raw, headers(signIpnPayload(ipn, "other-secret")))).toThrow(WebhookSignatureError);
    const tampered = JSON.stringify({ ...ipn, price_amount: 1000 });
    expect(() => nowPaymentsProvider.parseWebhook(tampered, headers(good))).toThrow(WebhookSignatureError);
  });

  it("builds explorer links per network", () => {
    expect(explorerUrl("usdttrc20", "h")).toBe("https://tronscan.org/#/transaction/h");
    expect(explorerUrl("usdtbsc", "h")).toBe("https://bscscan.com/tx/h");
    expect(explorerUrl("btc", null)).toBeNull();
  });
});
