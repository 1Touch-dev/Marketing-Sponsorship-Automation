import assert from "node:assert/strict";
import test from "node:test";
import { isReservedRecipientDomain, reservedRecipientBlock } from "../lib/email/reserved-recipient";

test("blocks example.com, example.org, and their subdomains", () => {
  for (const email of ["qa@example.com", "qa-blocked@example.com", "x@mail.example.org", "A@Example.COM"]) {
    assert.equal(isReservedRecipientDomain(email), true, email);
  }
});

test("blocks .test and .invalid TLDs", () => {
  for (const email of ["a@foo.test", "b@bar.invalid", "c@sub.lab.test"]) {
    assert.equal(isReservedRecipientDomain(email), true, email);
  }
});

test("allows real domains and lookalikes that are not reserved", () => {
  for (const email of ["user@coritiba.com.br", "rep@acme.com", "qa@notexample.com", "x@example.com.br"]) {
    assert.equal(isReservedRecipientDomain(email), false, email);
  }
});

test("reservedRecipientBlock returns reserved_domain with a readable message", () => {
  const block = reservedRecipientBlock("contato@example.com");
  assert.ok(block);
  assert.equal(block!.code, "reserved_domain");
  assert.match(block!.message, /reserved\/test domain/);
  assert.match(block!.message, /example\.com/);
  assert.equal(reservedRecipientBlock("ok@coritiba.com.br"), null);
});
