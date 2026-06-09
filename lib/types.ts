export type MeetingStatus = "Upcoming" | "Past" | "Cancelled" | "Unknown";

export type MeetingSection = "Current And Upcoming Meetings" | "Archived Meetings" | "Unknown";

export type DocumentType =
  | "HTML Agenda"
  | "Agenda"
  | "Packet"
  | "Public Comments"
  | "Minutes"
  | "Notice of Cancellation"
  | "Other";

export type PrimeGovDocument = {
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
};

export type PrimeGovMeeting = {
  section: MeetingSection;
  title: string;
  dateText: string | null;
  meetingType: string;
  rowText: string;
  status?: MeetingStatus;
  sourceType?: string | null;
  sourceUrl?: string | null;
  hasHtmlAgenda: boolean;
  hasPdf: boolean;
  documents: PrimeGovDocument[];
  htmlAgendaText?: string | null;
  extractionNotes?: string[];
  llmInputText?: string;
  publicCommentsInputText?: string | null;
};

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
  whatIsHappening: string;
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

export type SimpleCitySummary = {
  meetingSummary: {
    title: string;
    date: string;
    status: string;
    oneSentenceSummary: string;
  };
  cards: SimpleCityCard[];
};

export type SummaryCardRow = {
  id: string;
  meeting_id: string | null;
  agenda_item: string | null;
  what_is_happening: string | null;
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
  created_at: string | null;
  updated_at: string | null;
  meetings?: MeetingRow | null;
};

export type MeetingRow = {
  id: string;
  external_id: string | null;
  title: string;
  meeting_type: string | null;
  date_text: string | null;
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
  extraction_notes: unknown;
  raw: unknown;
  scraped_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type DocumentRow = {
  id: string;
  meeting_id: string | null;
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
  starts_at: string | null;
  ends_at: string | null;
  is_published: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};
