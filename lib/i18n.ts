import { CATEGORY_DEFINITIONS, type CategoryName } from "@/lib/constants";

export const LOCALE_COOKIE = "simplecity_locale";
export const LOCALE_CHANGE_EVENT = "simplecity:localechange";
export const LOCALE_STORAGE_KEY = "simplecity.locale";

export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LANGUAGE_OPTIONS: { locale: Locale; label: string; shortLabel: string }[] = [
  { locale: "en", label: "English", shortLabel: "EN" },
  { locale: "es", label: "Español", shortLabel: "ES" }
];

type TranslationKey =
  | "about"
  | "addToGoogleCalendar"
  | "adminAnnouncement"
  | "all"
  | "allMatchingMeetings"
  | "allStatuses"
  | "allTopics"
  | "browseByTopic"
  | "calendar"
  | "clearSearch"
  | "commentDeadline"
  | "commentOptionListed"
  | "connectedDecision"
  | "contact"
  | "dateNotListed"
  | "dayView"
  | "decisions"
  | "decisionsDescription"
  | "everydayImpactTitle"
  | "filter"
  | "filterByTopic"
  | "goHome"
  | "googleCalendar"
  | "hideSummary"
  | "howToAct"
  | "language"
  | "list"
  | "loading"
  | "meetingCanceled"
  | "meetingDetails"
  | "meetingPage"
  | "meetingTypeNotListed"
  | "meetings"
  | "meetingsDescription"
  | "monthView"
  | "next"
  | "noCardsInCategory"
  | "noCardsInCategoryDescription"
  | "noCardsYet"
  | "noDecisionsYet"
  | "noMatchingDecisions"
  | "noMatchingMeetings"
  | "noMeetingsForDay"
  | "noSourceDocuments"
  | "noCommentOptionListed"
  | "notListed"
  | "notListedInSource"
  | "officialDocuments"
  | "officialSource"
  | "openingMeeting"
  | "pageNotFound"
  | "past"
  | "previous"
  | "publicCommentInformation"
  | "readSummary"
  | "search"
  | "searchDecisions"
  | "searchDecisionsMeetingsTopics"
  | "searchMeetings"
  | "searchResults"
  | "selectADay"
  | "source"
  | "sourceNote"
  | "sourceTransparency"
  | "status"
  | "subscribe"
  | "subscribeAlreadySubscribedHelp"
  | "subscribeConfirmedBody"
  | "subscribeConfirmedTitle"
  | "subscribeEmailAddress"
  | "subscribeEmailPlaceholder"
  | "subscribeErrorBody"
  | "subscribeErrorTitle"
  | "subscribeEyebrow"
  | "subscribeFormFallbackError"
  | "subscribeFormSuccess"
  | "subscribeInvalidBody"
  | "subscribeInvalidTitle"
  | "subscribePageDescription"
  | "subscribePageTitle"
  | "subscribeUnsubscribedBody"
  | "subscribeUnsubscribedTitle"
  | "subscribeWeeklyDigestAreas"
  | "submitComment"
  | "summaryCards"
  | "summaryConfidence"
  | "timeNotListed"
  | "today"
  | "topics"
  | "topicNotListed"
  | "topPublicDecisions"
  | "tryAgain"
  | "tryBroaderMeetingSearch"
  | "tryChangingFilters"
  | "trySearching"
  | "upcoming"
  | "upcomingMeetings"
  | "viewAllDecisions"
  | "viewAllMeetings"
  | "viewCards"
  | "viewMeetingCalendar"
  | "viewResults"
  | "voteUpcoming"
  | "whatIsHappening"
  | "whoIsAffected"
  | "whyItMatters";

const translations: Record<Locale, Record<TranslationKey, string>> = {
  en: {
    about: "About",
    addToGoogleCalendar: "Add to Google Calendar",
    adminAnnouncement: "Admin announcement",
    all: "All",
    allMatchingMeetings: "All matching meetings",
    allStatuses: "All statuses",
    allTopics: "All topics",
    browseByTopic: "Browse by topic",
    calendar: "Calendar",
    clearSearch: "Clear search",
    commentDeadline: "Comment deadline",
    commentOptionListed: "Comment option listed",
    connectedDecision: "Connected decision",
    contact: "Contact",
    dateNotListed: "Date not listed",
    dayView: "Day view",
    decisions: "Decisions",
    decisionsDescription:
      "Read easy-to-understand, source-linked summaries of decisions being made by local government, ranked to show upcoming decisions first and then by recency and community impact.",
    everydayImpactTitle: "Find decisions by everyday impact",
    filter: "Filter",
    filterByTopic: "Filter by topic",
    goHome: "Go home",
    googleCalendar: "Google Calendar",
    hideSummary: "Hide summary",
    howToAct: "How to act",
    language: "Language",
    list: "List",
    loading: "Loading",
    meetingCanceled: "Meeting canceled",
    meetingDetails: "Meeting details",
    meetingPage: "Meeting page",
    meetingTypeNotListed: "Meeting type not listed",
    meetings: "Meetings",
    meetingsDescription: "See every collected meeting by month, day, or list, with search.",
    monthView: "Month view",
    next: "Next",
    noCardsInCategory: "No cards in this topic yet",
    noCardsInCategoryDescription: "Cards will appear here once official agenda items are collected and summarized.",
    noCardsYet: "No cards yet",
    noDecisionsYet: "No decisions yet",
    noMatchingDecisions: "No matching decisions",
    noMatchingMeetings: "No meetings match your search",
    noMeetingsForDay: "No meetings are listed for this day with the current search.",
    noSourceDocuments: "No source documents are stored for this meeting yet.",
    noCommentOptionListed: "No comment option listed",
    notListed: "Not listed",
    notListedInSource: "Not listed in the source document.",
    officialDocuments: "Official documents",
    officialSource: "Official source",
    openingMeeting: "Opening meeting",
    pageNotFound: "Page not found",
    past: "Past",
    previous: "Previous",
    publicCommentInformation: "Public comment information",
    readSummary: "Read summary",
    search: "Search",
    searchDecisions: "Search decisions",
    searchDecisionsMeetingsTopics: "Search decisions, meetings, or topics",
    searchMeetings: "Search meetings...",
    searchResults: "Search results",
    selectADay: "Select a day",
    source: "Source",
    sourceNote: "Source note",
    sourceTransparency: "Source transparency",
    status: "Status",
    subscribe: "Subscribe",
    subscribeAlreadySubscribedHelp:
      "Already subscribed? Enter the same email and choose new areas to update your email preferences. We will send a confirmation email before changing anything.",
    subscribeConfirmedBody:
      "Weekly digests will use your latest selected areas when new SimpleCity cards are published.",
    subscribeConfirmedTitle: "Your email updates are confirmed",
    subscribeEmailAddress: "Email address",
    subscribeEmailPlaceholder: "you@example.com",
    subscribeErrorBody: "Please try again in a moment.",
    subscribeErrorTitle: "Something went wrong",
    subscribeEyebrow: "Email updates",
    subscribeFormFallbackError: "Something went wrong. Please try again.",
    subscribeFormSuccess:
      "Check your inbox to confirm your SimpleCity email updates. If you were already subscribed, your preferences will update after you confirm.",
    subscribeInvalidBody:
      "If you already confirmed, you are all set. Submit the form again only if you need a fresh confirmation email.",
    subscribeInvalidTitle: "That link is expired or already used",
    subscribePageDescription:
      "Choose the cities and counties you care about. We’ll email you each week when new public-meeting cards are published.",
    subscribePageTitle: "Get new SimpleCity posts by email.",
    subscribeUnsubscribedBody: "You will no longer receive SimpleCity email digests.",
    subscribeUnsubscribedTitle: "You are unsubscribed",
    subscribeWeeklyDigestAreas: "Weekly digest areas",
    submitComment: "Submit comment",
    summaryCards: "Summary cards",
    summaryConfidence: "Summary confidence",
    timeNotListed: "Time not listed",
    today: "Today",
    topics: "Topics",
    topicNotListed: "Topic not listed",
    topPublicDecisions: "Top public decisions",
    tryAgain: "Try again",
    tryBroaderMeetingSearch: "Try a broader search or another jurisdiction.",
    tryChangingFilters: "Try changing the search or topic filter.",
    trySearching: "Try searching for a topic, department, meeting title, or everyday impact.",
    upcoming: "Upcoming",
    upcomingMeetings: "Upcoming meetings",
    viewAllDecisions: "View all decisions",
    viewAllMeetings: "View all meetings",
    viewCards: "View cards",
    viewMeetingCalendar: "View meeting calendar",
    viewResults: "View results",
    voteUpcoming: "Vote upcoming",
    whatIsHappening: "What's happening",
    whoIsAffected: "Who is affected",
    whyItMatters: "Why it matters"
  },
  es: {
    about: "Acerca de",
    addToGoogleCalendar: "Agregar a Google Calendar",
    adminAnnouncement: "Anuncio del administrador",
    all: "Todos",
    allMatchingMeetings: "Todas las reuniones coincidentes",
    allStatuses: "Todos los estados",
    allTopics: "Todos los temas",
    browseByTopic: "Explorar por tema",
    calendar: "Calendario",
    clearSearch: "Borrar búsqueda",
    commentDeadline: "Fecha límite para comentar",
    commentOptionListed: "Opción para comentar indicada",
    connectedDecision: "Decisión relacionada",
    contact: "Contacto",
    dateNotListed: "Fecha no indicada",
    dayView: "Vista del día",
    decisions: "Decisiones",
    decisionsDescription:
      "Lee resúmenes en lenguaje claro de decisiones del gobierno local, ordenados para mostrar primero las decisiones próximas y luego por actualidad e impacto comunitario.",
    everydayImpactTitle: "Encuentra decisiones por impacto cotidiano",
    filter: "Filtrar",
    filterByTopic: "Filtrar por tema",
    goHome: "Ir al inicio",
    googleCalendar: "Google Calendar",
    hideSummary: "Ocultar resumen",
    howToAct: "Cómo participar",
    language: "Idioma",
    list: "Lista",
    loading: "Cargando",
    meetingCanceled: "Reunión cancelada",
    meetingDetails: "Detalles de la reunión",
    meetingPage: "Página de la reunión",
    meetingTypeNotListed: "Tipo de reunión no indicado",
    meetings: "Reuniones",
    meetingsDescription: "Consulta cada reunión recopilada por mes, día o lista, con búsqueda.",
    monthView: "Vista mensual",
    next: "Siguiente",
    noCardsInCategory: "Aún no hay tarjetas en este tema",
    noCardsInCategoryDescription: "Las tarjetas aparecerán aquí cuando se recopilen y resuman los puntos oficiales de la agenda.",
    noCardsYet: "Aún no hay tarjetas",
    noDecisionsYet: "Aún no hay decisiones",
    noMatchingDecisions: "No hay decisiones coincidentes",
    noMatchingMeetings: "No hay reuniones que coincidan con tu búsqueda",
    noMeetingsForDay: "No hay reuniones indicadas para este día con la búsqueda actual.",
    noSourceDocuments: "Aún no hay documentos fuente guardados para esta reunión.",
    noCommentOptionListed: "No se indica opción para comentar",
    notListed: "No indicado",
    notListedInSource: "No indicado en el documento fuente.",
    officialDocuments: "Documentos oficiales",
    officialSource: "Fuente oficial",
    openingMeeting: "Abriendo reunión",
    pageNotFound: "Página no encontrada",
    past: "Pasadas",
    previous: "Anterior",
    publicCommentInformation: "Información para comentarios públicos",
    readSummary: "Leer resumen",
    search: "Buscar",
    searchDecisions: "Buscar decisiones",
    searchDecisionsMeetingsTopics: "Buscar decisiones, reuniones o temas",
    searchMeetings: "Buscar reuniones...",
    searchResults: "Resultados de búsqueda",
    selectADay: "Selecciona un día",
    source: "Fuente",
    sourceNote: "Nota sobre la fuente",
    sourceTransparency: "Transparencia de fuentes",
    status: "Estado",
    subscribe: "Suscribirse",
    subscribeAlreadySubscribedHelp:
      "¿Ya estás suscrito? Ingresa el mismo email y elige nuevas áreas para actualizar tus preferencias. Enviaremos un email de confirmación antes de cambiar nada.",
    subscribeConfirmedBody:
      "Los resúmenes semanales usarán las áreas que elegiste más recientemente cuando se publiquen nuevas tarjetas de SimpleCity.",
    subscribeConfirmedTitle: "Tus actualizaciones por email están confirmadas",
    subscribeEmailAddress: "Email",
    subscribeEmailPlaceholder: "tu@ejemplo.com",
    subscribeErrorBody: "Inténtalo de nuevo en un momento.",
    subscribeErrorTitle: "Algo salió mal",
    subscribeEyebrow: "Actualizaciones por email",
    subscribeFormFallbackError: "Algo salió mal. Inténtalo de nuevo.",
    subscribeFormSuccess:
      "Revisa tu inbox para confirmar tus actualizaciones de SimpleCity. Si ya estabas suscrito, tus preferencias se actualizarán después de confirmar.",
    subscribeInvalidBody:
      "Si ya confirmaste, todo está listo. Envía el formulario de nuevo solo si necesitas un email de confirmación nuevo.",
    subscribeInvalidTitle: "Ese enlace venció o ya fue usado",
    subscribePageDescription:
      "Elige las ciudades y condados que te interesan. Enviaremos un resumen semanal cuando se publiquen nuevas tarjetas de reuniones públicas.",
    subscribePageTitle: "Recibe nuevas publicaciones de SimpleCity por email.",
    subscribeUnsubscribedBody: "Ya no recibirás resúmenes por email de SimpleCity.",
    subscribeUnsubscribedTitle: "Cancelaste la suscripción",
    subscribeWeeklyDigestAreas: "Áreas del resumen semanal",
    submitComment: "Enviar comentario",
    summaryCards: "Tarjetas de resumen",
    summaryConfidence: "Confianza del resumen",
    timeNotListed: "Hora no indicada",
    today: "Hoy",
    topics: "Temas",
    topicNotListed: "Tema no indicado",
    topPublicDecisions: "Decisiones públicas principales",
    tryAgain: "Intentar de nuevo",
    tryBroaderMeetingSearch: "Prueba una búsqueda más amplia u otra jurisdicción.",
    tryChangingFilters: "Prueba cambiar la búsqueda o el filtro de tema.",
    trySearching: "Prueba buscar un tema, departamento, título de reunión o impacto cotidiano.",
    upcoming: "Próximas",
    upcomingMeetings: "Próximas reuniones",
    viewAllDecisions: "Ver todas las decisiones",
    viewAllMeetings: "Ver todas las reuniones",
    viewCards: "Ver tarjetas",
    viewMeetingCalendar: "Ver calendario de reuniones",
    viewResults: "Ver resultados",
    voteUpcoming: "Votación próxima",
    whatIsHappening: "Qué está pasando",
    whoIsAffected: "A quién afecta",
    whyItMatters: "Por qué importa"
  }
};

const categoryLabels: Record<Locale, Record<CategoryName, string>> = {
  en: {
    Housing: "Housing",
    Transportation: "Transportation",
    "Public Safety": "Public Safety",
    "Parks & Environment": "Parks & Environment",
    "Budget & Taxes": "Budget & Taxes",
    "Business & Development": "Business & Development",
    "Schools & Youth": "Schools & Youth",
    "City Services": "Public Services"
  },
  es: {
    Housing: "Vivienda",
    Transportation: "Transporte",
    "Public Safety": "Seguridad pública",
    "Parks & Environment": "Parques y ambiente",
    "Budget & Taxes": "Presupuesto e impuestos",
    "Business & Development": "Negocios y desarrollo",
    "Schools & Youth": "Escuelas y jóvenes",
    "City Services": "Servicios públicos"
  }
};

const categoryShortLabels: Record<Locale, Partial<Record<CategoryName, string>>> = {
  en: {
    Transportation: "Transportation",
    "Public Safety": "Public Safety",
    "Parks & Environment": "Parks & Environment",
    "Budget & Taxes": "Budget",
    "Business & Development": "Business",
    "Schools & Youth": "Schools",
    "City Services": "Public Services"
  },
  es: {
    Transportation: "Transporte",
    "Public Safety": "Seguridad",
    "Parks & Environment": "Parques",
    "Budget & Taxes": "Presupuesto",
    "Business & Development": "Negocios",
    "Schools & Youth": "Escuelas",
    "City Services": "Servicios"
  }
};

const categoryDescriptions: Record<Locale, Record<CategoryName, string>> = {
  en: Object.fromEntries(
    Object.entries(CATEGORY_DEFINITIONS).map(([category, definition]) => [
      category,
      definition.description
    ])
  ) as Record<CategoryName, string>,
  es: {
    Housing: "Rentas, viviendas asequibles, zonificación y decisiones que influyen en dónde puede vivir la gente.",
    Transportation: "Calles, ciclovías, estacionamiento, transporte público, seguridad vial y cómo se mueve la gente por la comunidad.",
    "Public Safety": "Policía, bomberos, respuesta a emergencias, preparación ante desastres y seguridad vecinal.",
    "Parks & Environment": "Parques, costas, trabajo climático, árboles, espacios abiertos y protecciones ambientales.",
    "Budget & Taxes": "Gasto público, tarifas, impuestos, bonos, contratos y decisiones sobre dinero público.",
    "Business & Development": "Nuevos edificios, negocios locales, desarrollo económico, permisos y proyectos importantes.",
    "Schools & Youth": "Programas juveniles, alianzas escolares, estudiantes, cuidado infantil y servicios para familias.",
    "City Services": "Servicios públicos, obras públicas, permisos, bibliotecas, mantenimiento y operaciones cotidianas del gobierno local."
  }
};

const statusLabels: Record<Locale, Record<string, string>> = {
  en: {
    Upcoming: "Upcoming",
    Past: "Past",
    Cancelled: "Cancelled",
    Canceled: "Canceled",
    Unknown: "Unknown",
    "Upcoming vote": "Upcoming vote",
    "Routine approval": "Routine approval",
    "Under discussion": "Under discussion",
    Passed: "Passed",
    Tabled: "Tabled",
    "Information only": "Information only",
    "Info only": "Info only"
  },
  es: {
    Upcoming: "Próxima",
    Past: "Pasada",
    Cancelled: "Cancelada",
    Canceled: "Cancelada",
    Unknown: "Desconocido",
    "Upcoming vote": "Votación próxima",
    "Routine approval": "Aprobación rutinaria",
    "Under discussion": "En discusión",
    Passed: "Aprobada",
    Tabled: "Postergada",
    "Information only": "Solo información",
    "Info only": "Solo información"
  }
};

export function normalizeLocale(value?: string | null): Locale {
  return LOCALES.includes(value as Locale) ? (value as Locale) : DEFAULT_LOCALE;
}

export function t(locale: Locale, key: TranslationKey) {
  return translations[locale][key] || translations[DEFAULT_LOCALE][key];
}

export function categoryLabel(locale: Locale, category?: string | null) {
  if (!category || !(category in CATEGORY_DEFINITIONS)) return category || "";
  return categoryLabels[locale][category as CategoryName];
}

export function categoryShortLabel(locale: Locale, category?: string | null) {
  if (!category || !(category in CATEGORY_DEFINITIONS)) return category || "";
  return categoryShortLabels[locale][category as CategoryName] || categoryLabel(locale, category);
}

export function categoryDescription(locale: Locale, category: CategoryName) {
  return categoryDescriptions[locale][category];
}

export function statusLabel(locale: Locale, status?: string | null) {
  const label = status || "Unknown";
  return statusLabels[locale][label] || label;
}
