/* ONE PAYMENT, ONE STAMP.
   On every payment's detail page: what this specific charge did to
   the merchant's books — the stamp it left at the Bureau. */
import {
  Badge,
  Box,
  ContextView,
  Inline,
} from "@stripe/ui-extension-sdk/ui";
import type { ExtensionContextValue } from "@stripe/ui-extension-sdk/context";
import { createHttpClient, STRIPE_API_KEY } from "@stripe/ui-extension-sdk/http_client";
import Stripe from "stripe";
import { useEffect, useState } from "react";

const stripe = new Stripe(STRIPE_API_KEY, {
  httpClient: createHttpClient() as Stripe.HttpClient,
  apiVersion: "2023-10-16",
});

const PaymentBureau = ({ environment }: ExtensionContextValue) => {
  const [line, setLine] = useState<string>("Reading the stamp…");
  const [good, setGood] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const id = environment?.objectContext?.id;
        if (!id) { setLine("No payment in view."); return; }
        const pi = await stripe.paymentIntents.retrieve(id);
        const charge = (pi.latest_charge && typeof pi.latest_charge === "string")
          ? await stripe.charges.retrieve(pi.latest_charge)
          : null;
        if (!charge) { setLine("No charge behind this payment yet."); return; }
        if (charge.disputed) {
          setGood(false);
          setLine("Disputed — this one reads against the payment-history book until it resolves clean.");
        } else if (charge.refunded) {
          setGood(false);
          setLine("Refunded — a soft mark. Refund discipline is part of the behavior book.");
        } else if (charge.status === "succeeded") {
          setGood(true);
          setLine("Clean money — this charge stamps the payment-history and cash-flow books.");
        } else {
          setLine("Status: " + charge.status + " — the books wait for kept money.");
        }
      } catch (e) {
        setLine("Couldn't read this payment — check the app's permissions.");
      }
    })();
  }, [environment?.objectContext?.id]);

  return (
    <ContextView
      title="The Bureau's stamp"
      description="What this payment did to your books."
    >
      <Box css={{ stack: "y", gapY: "medium" }}>
        {good !== null && (
          <Badge type={good ? "positive" : "warning"}>{good ? "✓ Stamps the books" : "Reads against"}</Badge>
        )}
        <Box css={{ font: "body" }}>{line}</Box>
        <Box css={{ font: "caption", color: "secondary" }}>
          <Inline css={{ fontWeight: "semibold" }}>Street Credit Bureau</Inline> — every kept
          dollar builds the record. Your score lives on the dashboard home.
        </Box>
      </Box>
    </ContextView>
  );
};

export default PaymentBureau;
