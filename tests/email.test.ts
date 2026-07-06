import assert from "node:assert/strict";
import test from "node:test";
import { getPublicAppUrlForRequest } from "@/lib/email/config";
import { buildNewPostsDigestEmail, labelForEmailSelections } from "@/lib/email/newPosts";
import { sendEmail } from "@/lib/email/resend";
import {
  confirmEmailSubscription,
  createOrRefreshSubscription,
  EmailSubscriptionInputError,
  filterSubscribersDueForDigest,
  type EmailSubscriberRow,
  type EmailSubscriberWithSubscriptions,
  type EmailSubscriptionRow,
  hashEmailToken,
  isSubscriptionDueForDigest,
  isValidSubscriberEmail,
  normalizeSubscriberEmail,
  normalizeSubscriptionJurisdictions,
  publicEmailJurisdictionOptions,
  unsubscribeEmailSubscriber,
  unsubscribeUrl
} from "@/lib/email/subscriptions";
import type { SummaryCardRow } from "@/lib/types";

function testCard(overrides: Partial<SummaryCardRow> = {}): SummaryCardRow {
  return {
    id: "card-1",
    meeting_id: "meeting-1",
    jurisdiction_name: "San Mateo",
    jurisdiction_slug: "san-mateo-city",
    platform: "primegov",
    agenda_item: "Item 4 - Approve park contract",
    what_is_happening: "The council will consider a maintenance contract for Central Park.",
    why_it_matters: "The contract affects park upkeep.",
    who_it_affects: ["park users"],
    category_tags: ["Parks & Environment"],
    status: "Upcoming vote",
    comment_window_opens: "Not listed in the source document.",
    comment_window_closes: "Not listed in the source document.",
    how_to_act_attend: "Attend the meeting.",
    how_to_act_email: "Not listed in the source document.",
    how_to_act_submit_comment: "Not listed in the source document.",
    source_url: "https://city.example/source",
    confidence: "high",
    is_published: true,
    is_featured: false,
    admin_notes: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    meetings: {
      id: "meeting-1",
      external_id: "external-meeting-1",
      jurisdiction_name: "San Mateo",
      jurisdiction_slug: "san-mateo-city",
      platform: "primegov",
      title: "City Council Meeting",
      meeting_type: "City Council",
      date_text: "June 10, 2026 7:00 PM",
      time_text: "7:00 PM",
      location: "City Hall",
      meeting_datetime: "2026-06-11T02:00:00.000Z",
      section: "Upcoming Meetings",
      status: "Upcoming",
      source_type: "Agenda",
      source_url: "https://city.example/agenda",
      row_text: "",
      has_html_agenda: true,
      has_pdf: false,
      llm_input_text: null,
      public_comments_input_text: null,
      source_hash: null,
      summarized_source_hash: null,
      cards_generated_at: null,
      extraction_notes: [],
      raw: null,
      scraped_at: null,
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-01T00:00:00.000Z"
    },
    ...overrides
  };
}

function testSubscription(overrides: Partial<EmailSubscriptionRow> = {}): EmailSubscriptionRow {
  return {
    id: "subscription-1",
    subscriber_id: "subscriber-1",
    jurisdiction_slug: "san-mateo-city",
    frequency: "weekly",
    last_digest_sent_at: "2026-07-01T00:00:00.000Z",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: null,
    ...overrides
  };
}

test("builds a new posts digest with escaped card content and meeting links", () => {
  const email = buildNewPostsDigestEmail({
    cards: [
      testCard({
        agenda_item: "Item 4 - <Approve> park contract",
        what_is_happening: "The council will consider a maintenance contract."
      })
    ],
    appUrl: "https://simplecity.example",
    selectionLabel: "San Mateo"
  });

  assert.match(email.subject, /Weekly SimpleCity digest: 1 new post/);
  assert.match(email.html, /&lt;Approve&gt;/);
  assert.doesNotMatch(email.html, /<Approve>/);
  assert.match(email.html, /https:\/\/simplecity\.example\/meetings\/meeting-1\?jurisdiction=san-mateo/);
  assert.match(email.text, /https:\/\/simplecity\.example\/meetings\/meeting-1\?jurisdiction=san-mateo/);
});

test("builds a bilingual digest when Spanish translations are attached", () => {
  const spanishCard = testCard({
    agenda_item: "Aprobar contrato de mantenimiento del parque",
    what_is_happening:
      "El concejo considerará un contrato de mantenimiento para Central Park.",
    category_tags: ["Parks & Environment"],
    meetings: {
      ...testCard().meetings!,
      title: "Reunión del Concejo Municipal",
      meeting_type: "Concejo Municipal"
    }
  });
  const email = buildNewPostsDigestEmail({
    cards: [
      {
        ...testCard(),
        translations: {
          es: spanishCard
        }
      }
    ],
    appUrl: "https://simplecity.example",
    selectionLabel: "San Mateo"
  });

  assert.match(email.subject, /Resumen semanal de SimpleCity/);
  assert.match(email.html, /En español/);
  assert.match(email.html, /Aprobar contrato de mantenimiento del parque/);
  assert.match(email.html, /Parques y ambiente/);
  assert.match(email.html, /Leer la tarjeta de SimpleCity/);
  assert.match(email.text, /El concejo considerará un contrato de mantenimiento/);
});

test("digest unsubscribe footer only advertises unsubscribe", () => {
  const email = buildNewPostsDigestEmail({
    cards: [testCard()],
    appUrl: "https://simplecity.example",
    selectionLabel: "San Mateo",
    unsubscribeUrl: "https://simplecity.example/api/email/unsubscribe?token=unsubscribe-123"
  });

  assert.match(email.html, />Unsubscribe \/ Cancelar suscripción<\/a>/);
  assert.match(
    email.text,
    /Unsubscribe \/ Cancelar suscripción: https:\/\/simplecity\.example\/api\/email\/unsubscribe\?token=unsubscribe-123/
  );
  assert.doesNotMatch(email.html, /change preferences/i);
  assert.doesNotMatch(email.text, /change preferences/i);
});

test("labels digest subjects by updated areas only", () => {
  assert.equal(labelForEmailSelections(["san-mateo-city"]), "San Mateo");
  assert.equal(
    labelForEmailSelections(["san-mateo-city", "mountain-view"]),
    "2 SimpleCity areas"
  );
  assert.match(
    buildNewPostsDigestEmail({
      cards: [testCard()],
      appUrl: "https://simplecity.test",
      selectionLabel: labelForEmailSelections(["san-mateo-city", "mountain-view"])
    }).subject,
    /Weekly SimpleCity digest: 1 new post for 2 SimpleCity areas/
  );
});

test("sends email through Resend", async (t) => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init: RequestInit }> = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = (async (url, init) => {
    requests.push({ url: String(url), init: init || {} });
    return new Response(JSON.stringify({ id: "email-123" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as typeof fetch;

  const result = await sendEmail(
    {
      to: "resident@example.com",
      subject: "New SimpleCity posts",
      text: "Hello"
    },
    {
      apiKey: "test-resend-key",
      from: "SimpleCity <onboarding@resend.dev>",
      replyTo: null,
      appUrl: "http://localhost:3000"
    }
  );

  const body = JSON.parse(String(requests[0].init.body || "{}")) as {
    from?: string;
    to?: string[];
    subject?: string;
    text?: string;
  };
  const headers = requests[0].init.headers as Record<string, string>;

  assert.equal(result.id, "email-123");
  assert.equal(requests[0].url, "https://api.resend.com/emails");
  assert.equal(headers.Authorization, "Bearer test-resend-key");
  assert.equal(body.from, "SimpleCity <onboarding@resend.dev>");
  assert.deepEqual(body.to, ["resident@example.com"]);
  assert.equal(body.subject, "New SimpleCity posts");
  assert.equal(body.text, "Hello");
});

test("requires Resend config before sending", async () => {
  await assert.rejects(
    () =>
      sendEmail(
        {
          to: "resident@example.com",
          subject: "New SimpleCity posts",
          text: "Hello"
        },
        {
          apiKey: "",
          from: "SimpleCity <onboarding@resend.dev>",
          replyTo: null,
          appUrl: "http://localhost:3000"
        }
      ),
    /Missing RESEND_API_KEY/
  );
});

test("normalizes subscription emails and concrete jurisdictions", () => {
  assert.equal(normalizeSubscriberEmail(" Resident@Example.COM "), "resident@example.com");
  assert.equal(isValidSubscriberEmail("resident@example.com"), true);
  assert.equal(isValidSubscriberEmail("not-an-email"), false);
  assert.deepEqual(
    normalizeSubscriptionJurisdictions([
      "san-mateo",
      "san-mateo-city",
      "all",
      "mountain-view"
    ]),
    ["san-mateo-city", "mountain-view"]
  );
  assert.equal(
    publicEmailJurisdictionOptions().map((option) => String(option.value)).includes("all"),
    false
  );
});

test("weekly digest subscriptions are only due after their cadence window", () => {
  const now = new Date("2026-07-08T00:00:00.000Z");

  assert.equal(
    isSubscriptionDueForDigest(
      testSubscription({ last_digest_sent_at: "2026-07-01T00:00:00.000Z" }),
      now
    ),
    true
  );
  assert.equal(
    isSubscriptionDueForDigest(
      testSubscription({ last_digest_sent_at: "2026-07-02T00:00:00.000Z" }),
      now
    ),
    false
  );
  assert.equal(
    isSubscriptionDueForDigest(
      testSubscription({
        frequency: "daily",
        last_digest_sent_at: "2026-07-07T00:00:00.000Z"
      }),
      now
    ),
    true
  );
  assert.equal(
    isSubscriptionDueForDigest(
      testSubscription({
        frequency: "daily",
        last_digest_sent_at: "2026-07-07T12:00:00.000Z"
      }),
      now
    ),
    false
  );
});

test("filters digest subscribers down to due subscriptions", () => {
  const subscribers: EmailSubscriberWithSubscriptions[] = [
    {
      id: "subscriber-1",
      email: "resident@example.com",
      email_normalized: "resident@example.com",
      status: "active",
      pending_jurisdiction_slugs: [],
      confirmation_token_hash: null,
      unsubscribe_token: "unsubscribe-123",
      confirmation_sent_at: null,
      confirmed_at: "2026-07-01T00:00:00.000Z",
      unsubscribed_at: null,
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: null,
      email_subscriptions: [
        testSubscription({
          id: "subscription-due",
          last_digest_sent_at: "2026-07-01T00:00:00.000Z"
        }),
        testSubscription({
          id: "subscription-not-due",
          jurisdiction_slug: "mountain-view",
          last_digest_sent_at: "2026-07-04T00:00:00.000Z"
        })
      ]
    }
  ];

  const dueSubscribers = filterSubscribersDueForDigest(
    subscribers,
    new Date("2026-07-08T00:00:00.000Z")
  );

  assert.deepEqual(
    dueSubscribers.flatMap((subscriber) =>
      (subscriber.email_subscriptions || []).map((subscription) => subscription.id)
    ),
    ["subscription-due"]
  );
});

test("subscription input errors are safe for public responses", async () => {
  await assert.rejects(
    () =>
      createOrRefreshSubscription(
        {
          email: "not-an-email",
          jurisdictions: ["san-mateo-city"]
        },
        {} as never
      ),
    EmailSubscriptionInputError
  );

  await assert.rejects(
    () =>
      createOrRefreshSubscription(
        {
          email: "resident@example.com",
          jurisdictions: ["not-a-real-city"]
        },
        {} as never
      ),
    EmailSubscriptionInputError
  );
});

test("builds stable email token hashes and unsubscribe URLs", () => {
  const hash = hashEmailToken("token-123");

  assert.equal(hash, hashEmailToken("token-123"));
  assert.notEqual(hash, "token-123");
  assert.equal(
    unsubscribeUrl("token-123", "https://simplecity.example/"),
    "https://simplecity.example/api/email/unsubscribe?token=token-123"
  );
});

test("confirmed subscription links are idempotent", async () => {
  const token = "token-123";
  const tokenHash = hashEmailToken(token);
  let subscriber: EmailSubscriberRow = {
    id: "subscriber-1",
    email: "resident@example.com",
    email_normalized: "resident@example.com",
    status: "pending",
    pending_jurisdiction_slugs: ["san-mateo-city"],
    confirmation_token_hash: tokenHash,
    unsubscribe_token: "unsubscribe-123",
    confirmation_sent_at: null,
    confirmed_at: null,
    unsubscribed_at: null,
    created_at: null,
    updated_at: null
  };
  const insertedSubscriptions: Array<{ jurisdiction_slug: string; frequency: string }> = [];
  const supabase = {
    from(table: string) {
      if (table === "email_subscribers") {
        return {
          select() {
            return {
              eq(column: string, value: string) {
                return {
                  maybeSingle: async () => ({
                    data:
                      column === "confirmation_token_hash" &&
                      subscriber.confirmation_token_hash === value
                        ? subscriber
                        : null,
                    error: null
                  })
                };
              }
            };
          },
          update(values: Partial<EmailSubscriberRow>) {
            return {
              eq() {
                return {
                  select() {
                    return {
                      single: async () => {
                        subscriber = { ...subscriber, ...values };
                        return { data: subscriber, error: null };
                      }
                    };
                  }
                };
              }
            };
          }
        };
      }

      return {
        delete() {
          return {
            eq: async () => ({ error: null })
          };
        },
        insert(rows: Array<{ jurisdiction_slug: string; frequency: string }>) {
          insertedSubscriptions.push(...rows);
          return Promise.resolve({ error: null });
        }
      };
    }
  };

  const firstResult = await confirmEmailSubscription(token, supabase as never);
  assert.equal(firstResult?.status, "active");
  assert.equal(firstResult?.confirmation_token_hash, tokenHash);
  assert.deepEqual(
    insertedSubscriptions.map((subscription) => ({
      jurisdiction_slug: subscription.jurisdiction_slug,
      frequency: subscription.frequency
    })),
    [{ jurisdiction_slug: "san-mateo-city", frequency: "weekly" }]
  );

  const secondResult = await confirmEmailSubscription(token, supabase as never);
  assert.equal(secondResult?.status, "active");
  assert.equal(insertedSubscriptions.length, 1);
});

test("unsubscribe token marks the subscriber unsubscribed", async () => {
  let subscriber: EmailSubscriberRow = {
    id: "subscriber-1",
    email: "resident@example.com",
    email_normalized: "resident@example.com",
    status: "active",
    pending_jurisdiction_slugs: [],
    confirmation_token_hash: null,
    unsubscribe_token: "unsubscribe-123",
    confirmation_sent_at: null,
    confirmed_at: "2026-07-04T18:00:00.000Z",
    unsubscribed_at: null,
    created_at: null,
    updated_at: null
  };
  const supabase = {
    from(table: string) {
      assert.equal(table, "email_subscribers");
      return {
        select() {
          return {
            eq(column: string, value: string) {
              assert.equal(column, "unsubscribe_token");
              return {
                maybeSingle: async () => ({
                  data: subscriber.unsubscribe_token === value ? subscriber : null,
                  error: null
                })
              };
            }
          };
        },
        update(values: Partial<EmailSubscriberRow>) {
          return {
            eq(column: string, value: string) {
              assert.equal(column, "id");
              assert.equal(value, subscriber.id);
              return {
                select() {
                  return {
                    single: async () => {
                      subscriber = { ...subscriber, ...values };
                      return { data: subscriber, error: null };
                    }
                  };
                }
              };
            }
          };
        }
      };
    }
  };

  const result = await unsubscribeEmailSubscriber(" unsubscribe-123 ", supabase as never);
  assert.equal(result?.status, "unsubscribed");
  assert.ok(result?.unsubscribed_at);

  const invalidResult = await unsubscribeEmailSubscriber("missing-token", supabase as never);
  assert.equal(invalidResult, null);
});

test("uses forwarded public host when configured app URL is local", () => {
  const request = new Request("https://localhost:10000/api/email/confirm?token=test", {
    headers: {
      "x-forwarded-host": "simplecity.app",
      "x-forwarded-proto": "https"
    }
  });

  assert.equal(
    getPublicAppUrlForRequest(request, {
      apiKey: "test-key",
      from: "SimpleCity <updates@simplecity.app>",
      replyTo: null,
      appUrl: "http://localhost:3000"
    }),
    "https://simplecity.app"
  );
});
