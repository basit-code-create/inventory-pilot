import { describe, expect, it } from "vitest";
import { signSessionToken, TEST_CONFIG, TEST_SHOP } from "../../test/shopify-fixtures";
import { InvalidSessionTokenError, readBearerToken, verifySessionToken } from "./session-token";
import { normalizeShopDomain } from "./shared";

const now = () => Math.floor(Date.now() / 1000);

async function expectRejected(token: string, reason: RegExp) {
  const result = verifySessionToken(token, TEST_CONFIG);
  await expect(result).rejects.toBeInstanceOf(InvalidSessionTokenError);
  await expect(result).rejects.toThrow(reason);
}

describe("verifySessionToken", () => {
  it("accepts a valid token and reads the shop from dest", async () => {
    const session = await verifySessionToken(await signSessionToken(), TEST_CONFIG);
    expect(session).toMatchObject({ shop: TEST_SHOP, userId: "42", sessionId: "session-1" });
  });

  it("rejects an expired token", async () => {
    await expectRejected(await signSessionToken({ exp: now() - 30 }), /expired/);
  });

  it("rejects a token that isn't valid yet", async () => {
    await expectRejected(await signSessionToken({ nbf: now() + 60 }), /nbf/);
  });

  it("rejects a token for a different app", async () => {
    await expectRejected(await signSessionToken({ aud: "another-app" }), /aud/);
  });

  it("rejects a token signed with a different secret", async () => {
    await expectRejected(await signSessionToken({}, { secret: "not-the-client-secret-0123456789abcdef" }), /signature/);
  });

  it("rejects algorithms other than HS256", async () => {
    await expectRejected(await signSessionToken({}, { alg: "HS512" }), /HS256/);
  });

  it("rejects an unsigned token", async () => {
    const [, payload] = (await signSessionToken()).split(".");
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    await expectRejected(`${header}.${payload}.`, /HS256|well-formed/);
  });

  it("rejects a token missing required claims", async () => {
    await expectRejected(await signSessionToken({ dest: undefined }), /dest/);
    await expectRejected(await signSessionToken({ nbf: undefined }), /nbf/);
  });

  it("rejects iss and dest for different shops", async () => {
    await expectRejected(await signSessionToken({ iss: "https://other-shop.myshopify.com/admin" }), /different shops/);
  });

  it("rejects a destination outside myshopify.com", async () => {
    await expectRejected(
      await signSessionToken({ iss: "https://evil.example.com/admin", dest: "https://evil.example.com" }),
      /myshopify/,
    );
  });

  it("rejects a non-https destination", async () => {
    await expectRejected(
      await signSessionToken({ iss: `http://${TEST_SHOP}/admin`, dest: `http://${TEST_SHOP}` }),
      /https/,
    );
  });
});

describe("readBearerToken", () => {
  it("reads a bearer token and nothing else", () => {
    expect(readBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(readBearerToken("bearer abc")).toBe("abc");
    expect(readBearerToken("Basic abc")).toBeNull();
    expect(readBearerToken("Bearer ")).toBeNull();
    expect(readBearerToken(null)).toBeNull();
  });
});

describe("normalizeShopDomain", () => {
  it("accepts only <name>.myshopify.com", () => {
    expect(normalizeShopDomain(" Demo-Shop.MyShopify.com ")).toBe("demo-shop.myshopify.com");
    expect(normalizeShopDomain("demo-shop.myshopify.com.evil.com")).toBeNull();
    expect(normalizeShopDomain("https://demo-shop.myshopify.com")).toBeNull();
    expect(normalizeShopDomain("-shop.myshopify.com")).toBeNull();
    expect(normalizeShopDomain(null)).toBeNull();
  });
});
