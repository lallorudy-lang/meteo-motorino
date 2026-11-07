import { test } from "node:test";
import assert from "node:assert/strict";
import { altezzaBarra } from "../viste/barre.js";

test("nessuna pioggia dà barra vuota", () => {
  assert.equal(altezzaBarra(0, 10), 0);
});

test("metà del massimo dà metà altezza", () => {
  assert.equal(altezzaBarra(5, 10), 50);
});

test("una pioggia minima resta visibile", () => {
  assert.equal(altezzaBarra(0.1, 10), 4);
});

test("l'altezza non supera il 100%", () => {
  assert.equal(altezzaBarra(30, 10), 100);
});

test("con massimo zero o assente la barra è vuota", () => {
  assert.equal(altezzaBarra(3, 0), 0);
});
