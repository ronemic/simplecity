import assert from "node:assert/strict";
import test from "node:test";
import {
  uniqueExistingExternalIdsByMeetingDetailsUrl,
  uniqueMeetingDetailsIdentityUrls
} from "@/lib/db/upsertMeetings";

test("does not treat a shared Menlo Park section URL as a meeting identity", () => {
  const sectionUrl = "https://www.menlopark.gov/Agendas-and-minutes#section-3";

  assert.deepEqual(
    uniqueMeetingDetailsIdentityUrls([
      { meetingDetailsUrl: sectionUrl, sectionUrl },
      { meetingDetailsUrl: sectionUrl, sectionUrl }
    ]),
    []
  );
});

test("does not reconcile a meeting details URL shared by multiple incoming meetings", () => {
  const detailsUrl = "https://example.com/meeting/shared";

  assert.deepEqual(
    uniqueMeetingDetailsIdentityUrls([
      { meetingDetailsUrl: detailsUrl, sectionUrl: "https://example.com/calendar" },
      { meetingDetailsUrl: detailsUrl, sectionUrl: "https://example.com/calendar" }
    ]),
    []
  );
});

test("allows a unique event-specific meeting details URL", () => {
  const detailsUrl = "https://www.cityofepa.org/event/2";

  assert.deepEqual(
    uniqueMeetingDetailsIdentityUrls([
      { meetingDetailsUrl: detailsUrl, sectionUrl: "https://www.cityofepa.org/calendar" }
    ]),
    [detailsUrl]
  );
});

test("does not select an arbitrary external id when stored rows share a details URL", () => {
  const sharedUrl = "https://www.menlopark.gov/Agendas-and-minutes#section-3";
  const uniqueUrl = "https://example.com/meeting/unique";
  const externalIds = uniqueExistingExternalIdsByMeetingDetailsUrl([
    { external_id: "february", meeting_details_url: sharedUrl },
    { external_id: "june", meeting_details_url: sharedUrl },
    { external_id: "unique", meeting_details_url: uniqueUrl }
  ]);

  assert.equal(externalIds.has(sharedUrl), false);
  assert.equal(externalIds.get(uniqueUrl), "unique");
});
