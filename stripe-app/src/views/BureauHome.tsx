/* THE BUREAU, ON THE DASHBOARD FRONT PORCH.
   The merchant's Street Score computed from their own Stripe data,
   rendered where they check their money every morning. Nothing
   leaves the dashboard — the CSP in the manifest has no connect-src
   on purpose; the score is theirs alone. */
import {
  Badge,
  Box,
  Button,
  ContextView,
  Divider,
  Inline,
  Link,
  ProgressBar,
} from "@stripe/ui-extension-sdk/ui";
import type { ExtensionContextValue } from "@stripe/ui-extension-sdk/context";
import { createHttpClient, STRIPE_API_KEY } from "@stripe/ui-extension-sdk/http_client";
import Stripe from "stripe";
import { useEffect, useState } from "react";
import { appraise, BureauReport } from "../bureau";

const stripe = new Stripe(STRIPE_API_KEY, {
  httpClient: createHttpClient() as Stripe.HttpClient,
  apiVersion: "2023-10-16",
});

const BureauHome = ({ userContext }: ExtensionContextValue) => {
  const [report, setReport] = useState<BureauReport | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const charges = await stripe.charges.list({ limit: 100 });
        setReport(
          appraise(
            charges.data.map((c) => ({
              status: c.status,
              amount: c.amount,
              refunded: c.refunded,
              disputed: !!c.disputed,
              created: c.created,
            })),
          ),
        );
      } catch (e) {
        setErr("The books didn't open — check the app's permissions.");
      }
    })();
  }, []);

  return (
    <ContextView
      title="Street Credit Bureau"
      description="Your street credit — kept by you, shown to who you choose."
      externalLink={{
        label: "The white paper behind the model",
        href: "https://mcclusterishere.github.io/McCluster-Portfolio/scb-paper.html",
      }}
    >
      {err && <Box css={{ color: "critical" }}>{err}</Box>}
      {!report && !err && <Box>Reading your books…</Box>}
      {report && (
        <Box css={{ stack: "y", gapY: "medium" }}>
          <Box css={{ stack: "x", gapX: "medium", alignY: "center" }}>
            <Box css={{ font: "heading", fontWeight: "bold" }}>{report.score}</Box>
            <Badge type={report.score >= 670 ? "positive" : report.score >= 580 ? "warning" : "neutral"}>
              {report.band}
            </Badge>
            <Box css={{ font: "caption", color: "secondary" }}>
              {report.sample} charges read · nothing leaves this dashboard
            </Box>
          </Box>
          <Divider />
          {report.books.map((b) => (
            <Box key={b.key} css={{ stack: "y", gapY: "xsmall" }}>
              <Inline css={{ font: "caption" }}>
                {b.label} · {Math.round(b.weight * 100)}% — <Inline css={{ fontWeight: "semibold" }}>{b.value}</Inline>
              </Inline>
              <ProgressBar value={b.value} max={100} />
            </Box>
          ))}
          <Divider />
          <Box css={{ font: "caption", color: "secondary" }}>
            <Inline css={{ fontWeight: "semibold" }}>The next move: </Inline>
            {report.next}
          </Box>
          <Button
            type="primary"
            href="https://mcclusterishere.github.io/McCluster-Portfolio/onboard.html"
            target="_blank"
          >
            Open your Community Word book — claim your page on M Network
          </Button>
          <Box css={{ font: "caption", color: "secondary" }}>
            A personal record computed from your own data — coaching, not
            consumer reporting. Model:{" "}
            <Link href="https://mcclusterishere.github.io/McCluster-Portfolio/scb-paper.html" target="_blank">
              Alternative Credit Ecosystems (McCluster Corp)
            </Link>
          </Box>
        </Box>
      )}
    </ContextView>
  );
};

export default BureauHome;
