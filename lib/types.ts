export type MeetingStatus =
  | "Upcoming"
  | "Past"
  | "Cancelled"
  | "Notice"
  | "Staff Report Release"
  | "Unknown";

export type MeetingSection =
  | "Current And Upcoming Meetings"
  | "Archived Meetings"
  | "Upcoming Meetings"
  | "All Meetings"
  | "Past Meetings"
  | "Unknown";

export type DocumentType =
  | "HTML Agenda"
  | "Agenda"
  | "Accessible Agenda"
  | "Agenda Packet"
  | "Packet"
  | "Public Comments"
  | "Minutes"
  | "Accessible Minutes"
  | "Notice of Cancellation"
  | "Special Event Notice"
  | "Early Staff Report Release"
  | "Media"
  | "Video"
  | "Spanish Video"
  | "Audio"
  | "Captions"
  | "Meeting Details"
  | "Calendar"
  | "Zoom"
  | "Transportation Form"
  | "Spanish Interpretation Form"
  | "Attachment"
  | "Staff Report"
  | "Resolution"
  | "Ordinance"
  | "Contract"
  | "Exhibit"
  | "Public Comment"
  | "Document"
  | "Other";

export type PrimeGovDocument = {
  jurisdictionName?: string | null;
  jurisdictionSlug?: string | null;
  platform?: string | null;
  type: DocumentType;
  label: string;
  url: string;
  localPath?: string | null;
  storagePath?: string | null;
  bytes?: number | null;
  downloadError?: string | null;
  extractedText?: string | null;
  extractionCharacterCount?: number | null;
  isScanned?: boolean;
  agendaItemNumber?: string | null;
  agendaItemTitle?: string | null;
  parentDocumentUrl?: string | null;
  isAgendaItemAttachment?: boolean;
};

export type PrimeGovMeeting = {
  externalId?: string | null;
  jurisdictionName?: string | null;
  jurisdictionSlug?: string | null;
  platform?: string | null;
  section: MeetingSection;
  title: string;
  dateText: string | null;
  timeText?: string | null;
  meetingType: string;
  bodyName?: string | null;
  location?: string | null;
  rowText: string;
  status?: MeetingStatus;
  sourceType?: string | null;
  sourceUrl?: string | null;
  source?: string | null;
  sectionUrl?: string | null;
  meetingDetailsUrl?: string | null;
  hasHtmlAgenda: boolean;
  hasPdf: boolean;
  documents: PrimeGovDocument[];
  htmlAgendaText?: string | null;
  detailText?: string | null;
  items?: AgendaItem[];
  extractionNotes?: string[];
  llmInputText?: string;
  publicCommentsInputText?: string | null;
};

export type AgendaItem = {
  externalId: string;
  fileNumber: string | null;
  agendaNumber: string | null;
  itemType: string | null;
  title: string | null;
  action: string | null;
  result: string | null;
  sourceUrl: string;
  rowText: string;
  status?: string | null;
  meetingBody?: string | null;
  onAgenda?: string | null;
  recommendedAction?: string | null;
  legislationText?: string | null;
  attachments?: PrimeGovDocument[];
  extractionError?: string | null;
};

export type LegistarItem = AgendaItem;

export type ScrapePortalResult = {
  source: string;
  scrapedAt: string;
  totalMeetingCount: number;
  currentAndUpcomingCount: number;
  archivedCount: number;
  meetings: PrimeGovMeeting[];
};

export type LlmReadyMeeting = PrimeGovMeeting & {
  id: string;
  status: MeetingStatus;
  sourceType: string | null;
  sourceUrl: string | null;
  extractionNotes: string[];
  llmInputText: string;
  publicCommentsInputText: string | null;
};

export type SimpleCityCard = {
  agendaItem: string;
  whatIsHappening: string[];
  whyItMatters: string;
  whoItAffects: string[];
  categoryTags: string[];
  status: string;
  commentWindow: {
    opens: string;
    closes: string;
  };
  howToAct: {
    attend: string;
    email: string;
    submitComment: string;
  };
  source: string;
  confidence: "high" | "medium" | "low";
};

export type SimpleCityCardTranslation = {
  agendaItem: string;
  whatIsHappening: string[];
  whyItMatters: string;
  whoItAffects: string[];
  status: string;
  commentWindow: {
    opens: string;
    closes: string;
  };
  howToAct: {
    attend: string;
    email: string;
    submitComment: string;
  };
};

export type SimpleCitySummary = {
  meetingSummary: {
    title: string;
    date: string;
    status: string;
    oneSentenceSummary: string;
  };
  cards: SimpleCityCard[];
  translations?: {
    es?: {
      meeting?: {
        title: string;
        meetingType: string;
      };
      cards: Array<SimpleCityCardTranslation | null>;
    };
  };
};

export type SummaryCardRow = {
  id: string;
  meeting_id: string | null;
  jurisdiction_name: string | null;
  jurisdiction_slug: string | null;
  platform: string | null;
  agenda_item: string | null;
  what_is_happening: string[] | string | null;
  what_is_happening_points?: string[] | null;
  why_it_matters: string | null;
  who_it_affects: string[] | null;
  category_tags: string[] | null;
  status: string | null;
  comment_window_opens: string | null;
  comment_window_closes: string | null;
  how_to_act_attend: string | null;
  how_to_act_email: string | null;
  how_to_act_submit_comment: string | null;
  source_url: string | null;
  confidence: string | null;
  is_published: boolean | null;
  is_featured: boolean | null;
  admin_notes: string | null;
  decision_sort_at?: string | null;
  created_at: string | null;
  updated_at: string | null;
  meetings?: MeetingRow | null;
};

export type SummaryCardTranslationRow = {
  id: string;
  summary_card_id: string;
  locale: string;
  agenda_item: string | null;
  what_is_happening: string[] | string | null;
  what_is_happening_points?: string[] | null;
  why_it_matters: string | null;
  who_it_affects: string[] | null;
  status: string | null;
  comment_window_opens: string | null;
  comment_window_closes: string | null;
  how_to_act_attend: string | null;
  how_to_act_email: string | null;
  how_to_act_submit_comment: string | null;
  source_fingerprint: string | null;
  translation_status: string | null;
  raw_llm_json: unknown;
  translated_at: string | null;
  reviewed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type MeetingRow = {
  id: string;
  external_id: string | null;
  jurisdiction_name: string | null;
  jurisdiction_slug: string | null;
  platform: string | null;
  title: string;
  meeting_type: string | null;
  date_text: string | null;
  time_text?: string | null;
  location?: string | null;
  meeting_datetime: string | null;
  section: string | null;
  status: string | null;
  source_type: string | null;
  source_url: string | null;
  row_text: string | null;
  has_html_agenda: boolean | null;
  has_pdf: boolean | null;
  llm_input_text: string | null;
  public_comments_input_text: string | null;
  source_hash: string | null;
  summarized_source_hash: string | null;
  cards_generated_at: string | null;
  extraction_notes: unknown;
  raw: unknown;
  scraped_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type MeetingTranslationRow = {
  id: string;
  meeting_id: string;
  locale: string;
  title: string | null;
  meeting_type: string | null;
  source_fingerprint: string | null;
  translation_status: string | null;
  raw_llm_json: unknown;
  translated_at: string | null;
  reviewed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type DocumentRow = {
  id: string;
  meeting_id: string | null;
  jurisdiction_name: string | null;
  jurisdiction_slug: string | null;
  platform: string | null;
  type: string | null;
  label: string | null;
  source_url: string;
  local_path: string | null;
  storage_path: string | null;
  bytes: number | null;
  download_error: string | null;
  extracted_text: string | null;
  extraction_character_count: number | null;
  is_scanned: boolean | null;
  created_at: string | null;
};

export type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  type: string | null;
  jurisdiction_slug: string | null;
  source_jurisdiction_slug?: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_published: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};
