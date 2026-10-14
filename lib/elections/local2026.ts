// Hand-written plain-language summaries of the local measures and races on the
// November 3, 2026 ballot in the places SimpleCity covers. Every fact here is
// checked against an official source (county elections office, city clerk,
// ballot question, impartial analysis); `officialUrl` is the page to check it
// against. Measures that could not be confirmed from an official source are
// left out rather than filled in from news reports.

import {
  ALL_JURISDICTIONS_SLUG,
  getPublicJurisdictionOptions,
  toInternalJurisdictionSlug,
  type JurisdictionSelection,
  type JurisdictionSlug
} from "@/lib/config/jurisdictions";
import type { Localized } from "@/lib/elections/california2026";

export type MeasureScope = "city" | "county" | "regional" | "school" | "special";
export type MeasureThreshold = "majority" | "fifty-five" | "two-thirds";

export type LocalMeasure = {
  id: string;
  /** Omitted when the county assigns no letter (the regional transit measure). */
  letter?: string;
  body: Localized;
  scope: MeasureScope;
  /** Covered jurisdictions whose voters see this measure. */
  appearsIn: JurisdictionSlug[];
  /** False when only some addresses in those jurisdictions vote on it. */
  allAddresses: boolean;
  kind: "tax" | "bond" | "charter" | "ordinance" | "initiative" | "advisory";
  threshold: MeasureThreshold;
  placedBy: "body" | "petition";
  title: Localized;
  summary: Localized;
  cost?: Localized;
  yes: Localized;
  no: Localized;
  debate?: Localized;
  officialUrl: string;
  /** The decision card for the vote that put the measure (or initiative) before voters. */
  placement?: { cardId: string; date: string; body: Localized };
};

export type LocalContest = {
  jurisdiction: JurisdictionSlug;
  office: Localized;
  seats: Localized;
  officialUrl: string;
};

export type CountySlug = "san-francisco" | "san-mateo-county" | "santa-clara-county" | "santa-barbara-county";

export const COUNTY_ORDER: CountySlug[] = [
  "san-francisco",
  "san-mateo-county",
  "santa-clara-county",
  "santa-barbara-county"
];

export const SCOPE_ORDER: MeasureScope[] = ["city", "county", "regional", "school", "special"];

export const COUNTY_VOTER_TOOLS: Record<CountySlug, { name: Localized; url: string }> = {
  "san-francisco": {
    name: { en: "San Francisco Department of Elections", es: "Departamento de Elecciones de San Francisco" },
    url: "https://sfelections.gov/voterportal"
  },
  "san-mateo-county": {
    name: { en: "San Mateo County Elections", es: "Elecciones del Condado de San Mateo" },
    url: "https://smcacre.gov/elections/my-election-info"
  },
  "santa-clara-county": {
    name: { en: "Santa Clara County Registrar of Voters", es: "Registro de Votantes del Condado de Santa Clara" },
    url: "https://vote.santaclaracounty.gov"
  },
  "santa-barbara-county": {
    name: { en: "Santa Barbara County Elections", es: "Elecciones del Condado de Santa Bárbara" },
    url: "https://www.countyofsb.org/acr-elections-polling-place-and-voter-information-guide-and-sample-ballot-lookup"
  }
};

export const LOCAL_MEASURES: LocalMeasure[] = [
  {
    id: "sf-A",
    letter: "A",
    body: {
      en: "City and County of San Francisco",
      es: "Ciudad y Condado de San Francisco"
    },
    scope: "city",
    appearsIn: ["san-francisco"],
    allAddresses: true,
    kind: "charter",
    threshold: "majority",
    placedBy: "body",
    title: {
      en: "Updates Charter rules for city departments and commissions",
      es: "Actualiza la Carta Municipal sobre departamentos y comisiones"
    },
    summary: {
      en: "Charter amendment that updates Charter language to match how some departments operate, changes some processes (for example, approving legal settlements by resolution instead of ordinance), and eliminates, combines or moves some commissions and advisory bodies from the Charter into the Municipal Code. It requires the Board of Supervisors to amend voter-approved laws to carry out some changes, and requires a task force to review commissions every ten years.",
      es: "Enmienda a la Carta Municipal que actualiza su redacción para reflejar cómo operan algunos departamentos, modifica ciertos procesos (por ejemplo, aprobar acuerdos legales por resolución en lugar de por ordenanza) y elimina, fusiona o traslada algunas comisiones y órganos asesores de la Carta al Código Municipal. Exige que la Junta de Supervisores enmiende leyes aprobadas por el electorado para aplicar algunos cambios y que un grupo de trabajo revise las comisiones cada diez años."
    },
    cost: {
      en: "The Controller estimates savings of $365,000 to $450,000 a year, mainly from eliminating some commissions; other costs or savings depend on future budget decisions.",
      es: "La Contraloría estima un ahorro de $365,000 a $450,000 al año, principalmente por eliminar algunas comisiones; otros costos o ahorros dependen de futuras decisiones presupuestarias."
    },
    yes: {
      en: "The Charter would be amended to align it with how some departments operate, change some processes, eliminate or reorganize certain commissions and advisory bodies, and require the Board to amend voter-approved laws to enact some of these changes.",
      es: "Se enmendaría la Carta Municipal para armonizarla con el funcionamiento de algunos departamentos, modificar ciertos procesos, eliminar o reorganizar determinadas comisiones y órganos asesores, y exigir que la Junta enmiende leyes aprobadas por el electorado para aplicar algunos de estos cambios."
    },
    no: {
      en: "These changes would not be made.",
      es: "No se harían estos cambios."
    },
    debate: {
      en: "Official argument for: Mayor Daniel Lurie, Board President Rafael Mandelman, several supervisors and state legislators. Official argument against: Coalition on Homelessness.",
      es: "Argumento oficial a favor: el alcalde Daniel Lurie, el presidente de la Junta Rafael Mandelman, varios supervisores y legisladores estatales. Argumento oficial en contra: Coalición contra la Falta de Vivienda (Coalition on Homelessness)."
    },
    officialUrl: "https://www.sf.gov/qualified-ballot-measures",
    placement: { cardId: "f2412ce0-8805-401f-878d-b86a596fd04c", date: "2026-07-14", body: { en: "Board of Supervisors", es: "Junta de Supervisores" } }
  },
  {
    id: "sf-B",
    letter: "B",
    body: {
      en: "City and County of San Francisco",
      es: "Ciudad y Condado de San Francisco"
    },
    scope: "city",
    appearsIn: ["san-francisco"],
    allAddresses: true,
    kind: "charter",
    threshold: "majority",
    placedBy: "body",
    title: {
      en: "Authorizes a city finance corporation and public bank",
      es: "Autoriza una corporación de financiamiento municipal y un banco público"
    },
    summary: {
      en: "Charter amendment that authorizes, but does not require, the City to create a municipal finance corporation that makes loans (but takes no deposits) if the City has sufficient funding. After three years it could become a public bank that also takes deposits. Loans would support affordable housing, homeownership, small business, environmental sustainability and environmental justice; each entity would have its own board and oversight commission.",
      es: "Enmienda a la Carta Municipal que autoriza, sin obligar, a la Ciudad a crear una corporación de financiamiento municipal que otorgue préstamos (sin captar depósitos) si la Ciudad cuenta con fondos suficientes. Tras tres años podría convertirse en un banco público que también capte depósitos. Los préstamos apoyarían la vivienda asequible, la compra de vivienda, las pequeñas empresas, la sostenibilidad ambiental y la justicia ambiental; cada entidad tendría su propia junta directiva y comisión de supervisión."
    },
    cost: {
      en: "No direct cost from the amendment itself. If the City creates the corporation and bank, the Controller cites estimates of about $310 million to $460 million over eight years, with a high degree of uncertainty.",
      es: "La enmienda en sí no tiene costo directo. Si la Ciudad crea la corporación y el banco, la Contraloría cita estimaciones de unos $310 millones a $460 millones en ocho años, con un alto grado de incertidumbre."
    },
    yes: {
      en: "The City would be authorized to establish a municipal finance corporation and a public bank.",
      es: "Se autorizaría a la Ciudad a establecer una corporación de financiamiento municipal y un banco público."
    },
    no: {
      en: "The City would not be authorized to establish a municipal finance corporation and a public bank.",
      es: "No se autorizaría a la Ciudad a establecer una corporación de financiamiento municipal y un banco público."
    },
    debate: {
      en: "Official argument for: San Francisco Public Bank Coalition, The San Francisco Foundation, several supervisors and labor and housing groups. Official argument against: No on Prop B – San Franciscans for Fiscal Responsibility.",
      es: "Argumento oficial a favor: San Francisco Public Bank Coalition, The San Francisco Foundation, varios supervisores y grupos laborales y de vivienda. Argumento oficial en contra: No on Prop B – San Franciscans for Fiscal Responsibility."
    },
    officialUrl: "https://www.sf.gov/qualified-ballot-measures",
    placement: { cardId: "7dac4818-f847-4c1b-ad93-69af696018ad", date: "2026-07-07", body: { en: "Board of Supervisors", es: "Junta de Supervisores" } }
  },
  {
    id: "sf-C",
    letter: "C",
    body: {
      en: "City and County of San Francisco",
      es: "Ciudad y Condado de San Francisco"
    },
    scope: "city",
    appearsIn: ["san-francisco"],
    allAddresses: true,
    kind: "charter",
    threshold: "majority",
    placedBy: "body",
    title: {
      en: "Increases city contributions to the Housing Trust Fund",
      es: "Aumenta los aportes municipales al Fondo Fiduciario para la Vivienda"
    },
    summary: {
      en: "Charter amendment that changes how the City's yearly contribution to the Housing Trust Fund is set: starting in 2028 it would grow until it reaches at least $125 million a year, then rise up to 3% a year. It raises the income limit for downpayment loans from 120% to 200% of Area Median Income, allows spending on housing-related infrastructure, and extends the Fund from 2043 to 2058. The City could freeze contributions when a projected deficit exceeds $250 million.",
      es: "Enmienda a la Carta Municipal que cambia cómo se fija el aporte anual de la Ciudad al Fondo Fiduciario para la Vivienda: a partir de 2028 crecería hasta alcanzar al menos $125 millones al año y luego aumentaría hasta un 3% anual. Eleva el límite de ingresos para préstamos de pago inicial del 120% al 200% del Ingreso Medio del Área, permite gastar en infraestructura relacionada con la vivienda y prorroga el Fondo de 2043 a 2058. La Ciudad podría congelar los aportes cuando el déficit proyectado supere $250 millones."
    },
    cost: {
      en: "The Controller estimates about $6 million in added General Fund costs in fiscal year 2028-29, growing to about $60 million a year by 2034-35.",
      es: "La Contraloría estima unos $6 millones en costos adicionales del Fondo General en el año fiscal 2028-29, que crecerían a unos $60 millones al año para 2034-35."
    },
    yes: {
      en: "The Charter would be amended to change how the City's yearly Housing Trust Fund contributions are set, increase funding and expand affordable housing programs, and extend the Fund to 2058.",
      es: "Se enmendaría la Carta Municipal para modificar cómo se fijan los aportes anuales de la Ciudad al Fondo Fiduciario para la Vivienda, aumentar el financiamiento, ampliar los programas de vivienda asequible y prorrogar el Fondo hasta 2058."
    },
    no: {
      en: "These changes would not be made.",
      es: "No se harían estos cambios."
    },
    debate: {
      en: "Official argument for: Mayor Daniel Lurie, Supervisor Myrna Melgar, Assemblymember Catherine Stefani and affordable housing leaders. Official argument against: San Francisco Republican Party.",
      es: "Argumento oficial a favor: el alcalde Daniel Lurie, la supervisora Myrna Melgar, la asambleísta Catherine Stefani y líderes de vivienda asequible. Argumento oficial en contra: Partido Republicano de San Francisco."
    },
    officialUrl: "https://www.sf.gov/qualified-ballot-measures",
    placement: { cardId: "c3a04615-08df-4925-866a-521754401679", date: "2026-07-14", body: { en: "Board of Supervisors", es: "Junta de Supervisores" } }
  },
  {
    id: "sf-D",
    letter: "D",
    body: {
      en: "City and County of San Francisco",
      es: "Ciudad y Condado de San Francisco"
    },
    scope: "city",
    appearsIn: ["san-francisco"],
    allAddresses: true,
    kind: "charter",
    threshold: "majority",
    placedBy: "petition",
    title: {
      en: "Raises signature requirements and changes how measures reach ballot",
      es: "Aumenta las firmas exigidas y cambia cómo se incorporan medidas a la boleta"
    },
    summary: {
      en: "Charter amendment that raises the signatures needed for a citizen initiative from 2% to 8% of registered voters (about 10,600 to about 42,500 today) and for calling a special election to 10% of registered voters (about 53,100). It lets initiative proponents withdraw a measure up to 102 days before the election, and ends the ability of four or more supervisors, or the Mayor alone, to place measures on the ballot; the Board could still do so by majority vote.",
      es: "Enmienda a la Carta Municipal que eleva las firmas necesarias para una iniciativa ciudadana del 2% al 8% de los electores inscritos (de unas 10,600 a unas 42,500 hoy) y para convocar una elección especial al 10% de los electores inscritos (unas 53,100). Permite retirar una iniciativa hasta 102 días antes de la elección y elimina la facultad de cuatro o más supervisores, o del alcalde por sí solo, de incorporar medidas a la boleta; la Junta podría seguir haciéndolo por mayoría de votos."
    },
    cost: {
      en: "The Controller estimates a minimal impact on the cost of government.",
      es: "La Contraloría estima un impacto mínimo en el costo del gobierno."
    },
    yes: {
      en: "Signature requirements for initiatives would rise from 2% to 8% of registered voters, requirements for special elections would rise, initiatives could be withdrawn, and a minority of supervisors or the Mayor could no longer place measures on the ballot.",
      es: "El umbral de firmas para iniciativas subiría del 2% al 8% de los electores inscritos, aumentarían los requisitos para elecciones especiales, se podrían retirar iniciativas, y ni una minoría de supervisores ni el alcalde podrían incorporar medidas a la boleta."
    },
    no: {
      en: "These changes would not be made.",
      es: "No se harían estos cambios."
    },
    debate: {
      en: "Official argument for: Mayor Daniel Lurie, Board President Rafael Mandelman, Speaker Emerita Nancy Pelosi and others. Official argument against: San Francisco Labor Council, Senior & Disability Action, United Educators of San Francisco, tenant groups and others.",
      es: "Argumento oficial a favor: el alcalde Daniel Lurie, el presidente de la Junta Rafael Mandelman, la presidenta emérita de la Cámara Nancy Pelosi y otros. Argumento oficial en contra: Consejo Laboral de San Francisco, Senior & Disability Action, United Educators of San Francisco, grupos de inquilinos y otros."
    },
    officialUrl: "https://www.sf.gov/qualified-ballot-measures"
  },
  {
    id: "sf-E",
    letter: "E",
    body: {
      en: "City and County of San Francisco",
      es: "Ciudad y Condado de San Francisco"
    },
    scope: "city",
    appearsIn: ["san-francisco"],
    allAddresses: true,
    kind: "charter",
    threshold: "majority",
    placedBy: "petition",
    title: {
      en: "Expands City Administrator authority over city contracting",
      es: "Amplía las facultades del administrador municipal sobre la contratación"
    },
    summary: {
      en: "Charter amendment that gives the City Administrator exclusive authority to propose purchasing and contracting ordinances (the Board and Mayor could approve or reject them within 60 days, but not amend them) and to set citywide purchasing and technology rules. It raises the amounts that need Board approval to $4.5 million for revenue contracts and leases and $25 million for spending contracts, adjusted for inflation from 2032, and extends the City Administrator's term from five to ten years.",
      es: "Enmienda a la Carta Municipal que otorga al administrador municipal la facultad exclusiva de proponer ordenanzas sobre adquisiciones y contratación (la Junta y el alcalde podrían aprobarlas o rechazarlas en 60 días, pero no enmendarlas) y de fijar normas de adquisición y tecnología para toda la Ciudad. Eleva los montos que requieren aprobación de la Junta a $4.5 millones para contratos y arrendamientos que generan ingresos y a $25 millones para contratos de gasto, ajustados por inflación desde 2032, y amplía el mandato del administrador municipal de cinco a diez años."
    },
    cost: {
      en: "The Controller estimates a minimal impact on the cost of government, at a level that cannot be determined.",
      es: "La Contraloría estima un impacto mínimo en el costo del gobierno, en un nivel que no puede determinarse."
    },
    yes: {
      en: "The City Administrator would get more authority by centralizing purchasing rules, the way purchasing rules are approved would change, fewer contracts and leases would need Board approval, and the City Administrator's term would be extended.",
      es: "El administrador municipal tendría más facultades al centralizarse las normas de adquisición, cambiaría la forma de aprobarlas, menos contratos y arrendamientos requerirían aprobación de la Junta y se prolongaría el mandato del administrador municipal."
    },
    no: {
      en: "These changes would not be made.",
      es: "No se harían estos cambios."
    },
    debate: {
      en: "Official argument for: Mayor Daniel Lurie, Board President Rafael Mandelman, former Controller Ben Rosenfield and others. Official argument against: Larry S. Marso.",
      es: "Argumento oficial a favor: el alcalde Daniel Lurie, el presidente de la Junta Rafael Mandelman, el excontralor Ben Rosenfield y otros. Argumento oficial en contra: Larry S. Marso."
    },
    officialUrl: "https://www.sf.gov/qualified-ballot-measures"
  },
  {
    id: "sf-F",
    letter: "F",
    body: {
      en: "City and County of San Francisco",
      es: "Ciudad y Condado de San Francisco"
    },
    scope: "city",
    appearsIn: ["san-francisco"],
    allAddresses: true,
    kind: "charter",
    threshold: "majority",
    placedBy: "petition",
    title: {
      en: "Expands the Mayor's power to manage departments and commissions",
      es: "Amplía las facultades del alcalde para dirigir departamentos y comisiones"
    },
    summary: {
      en: "Charter amendment that lets the Mayor transfer responsibilities between most departments or combine them under one head unless the Board objects, hire deputy mayors to supervise most Charter departments, and hire some and fire most department heads without commission involvement. It also lets the officials who appoint most board and commission members remove them at any time without cause (except the Board of Appeals, Civil Service Commission and Ethics Commission).",
      es: "Enmienda a la Carta Municipal que permite al alcalde transferir responsabilidades entre la mayoría de los departamentos o unirlos bajo un solo jefe salvo que la Junta se oponga, contratar vicealcaldes para supervisar la mayoría de los departamentos de la Carta, y contratar a algunos y destituir a la mayoría de los jefes de departamento sin intervención de las comisiones. También permite que los funcionarios que nombran a la mayoría de los miembros de juntas y comisiones los destituyan en cualquier momento sin causa (salvo la Junta de Apelaciones, la Comisión de Servicio Civil y la Comisión de Ética)."
    },
    cost: {
      en: "The Controller estimates a minimal impact on the cost of government; a deputy mayor would cost about $250,000 a year.",
      es: "La Contraloría estima un impacto mínimo en el costo del gobierno; cada vicealcalde costaría unos $250,000 al año."
    },
    yes: {
      en: "The Mayor could transfer responsibilities between departments, hire deputy mayors, and hire some and fire most department heads, and City officials could remove board and commission members without cause.",
      es: "El alcalde podría transferir responsabilidades entre departamentos, contratar vicealcaldes, y contratar a algunos y destituir a la mayoría de los jefes de departamento, y los funcionarios de la Ciudad podrían destituir a miembros de juntas y comisiones sin causa justificada."
    },
    no: {
      en: "These changes would not be made.",
      es: "No se harían estos cambios."
    },
    debate: {
      en: "Official argument for: Mayor Daniel Lurie, Board President Rafael Mandelman, Speaker Emerita Nancy Pelosi and others. Official argument against: Small Business Forward.",
      es: "Argumento oficial a favor: el alcalde Daniel Lurie, el presidente de la Junta Rafael Mandelman, la presidenta emérita de la Cámara Nancy Pelosi y otros. Argumento oficial en contra: Small Business Forward."
    },
    officialUrl: "https://www.sf.gov/qualified-ballot-measures"
  },
  {
    id: "sf-G",
    letter: "G",
    body: {
      en: "City and County of San Francisco",
      es: "Ciudad y Condado de San Francisco"
    },
    scope: "city",
    appearsIn: ["san-francisco"],
    allAddresses: true,
    kind: "ordinance",
    threshold: "majority",
    placedBy: "petition",
    title: {
      en: "Reopens Upper Great Highway to cars on weekdays",
      es: "Reabre la Gran Autopista Superior a los autos entre semana"
    },
    summary: {
      en: "Initiative ordinance that would close Sunset Dunes Park from Monday 4:00 a.m. to Friday 6:00 p.m. (except weekday holidays) and reopen the Upper Great Highway between Lincoln Way and Sloat Boulevard to private vehicles during those hours. The City would have to obtain all required approvals, including Coastal Act permits. The park would stay car-free on weekends and holidays.",
      es: "Ordenanza de iniciativa que cerraría el parque Sunset Dunes desde el lunes a las 4:00 a.m. hasta el viernes a las 6:00 p.m. (salvo feriados entre semana) y reabriría a vehículos particulares la Gran Autopista Superior (Upper Great Highway) entre Lincoln Way y Sloat Boulevard en ese horario. La Ciudad tendría que obtener todas las aprobaciones necesarias, incluidos los permisos de la Ley Costera. El parque seguiría sin autos los fines de semana y feriados."
    },
    cost: {
      en: "The Controller estimates about $9.8 million in one-time capital costs (including new traffic signals) and $500,000 to $1.9 million a year in added costs.",
      es: "La Contraloría estima unos $9.8 millones en costos de capital únicos (incluidos nuevos semáforos) y de $500,000 a $1.9 millones al año en costos adicionales."
    },
    yes: {
      en: "Sunset Dunes Park would close Monday 4:00 a.m. through Friday 6:00 p.m. (except weekday holidays) so the Upper Great Highway can reopen to private vehicles during that time.",
      es: "El parque Sunset Dunes se cerraría de lunes a las 4:00 a.m. a viernes a las 6:00 p.m. (salvo feriados entre semana) para reabrir la Gran Autopista Superior a vehículos particulares en ese horario."
    },
    no: {
      en: "The City would not make these changes; the Upper Great Highway would stay closed to private vehicles as part of Sunset Dunes Park.",
      es: "La Ciudad no haría estos cambios; la Gran Autopista Superior seguiría cerrada a vehículos particulares como parte del parque Sunset Dunes."
    },
    debate: {
      en: "Official argument for: Richard Corriea, retired SFPD Commander. Official argument against: Senator Scott Wiener, several supervisors and the Sierra Club, among others.",
      es: "Argumento oficial a favor: Richard Corriea, comandante retirado de la SFPD. Argumento oficial en contra: el senador Scott Wiener, varios supervisores y el Sierra Club, entre otros."
    },
    officialUrl: "https://www.sf.gov/qualified-ballot-measures"
  },
  {
    id: "sf-H",
    letter: "H",
    body: {
      en: "City and County of San Francisco",
      es: "Ciudad y Condado de San Francisco"
    },
    scope: "city",
    appearsIn: ["san-francisco"],
    allAddresses: true,
    kind: "tax",
    threshold: "majority",
    placedBy: "petition",
    title: {
      en: "Parcel tax to fund Muni service for 15 years",
      es: "Impuesto por parcela para financiar el servicio de Muni por 15 años"
    },
    summary: {
      en: "Creates an annual parcel tax from July 1, 2027 to June 30, 2042, used only for Muni service, estimated at $177 million a year. Rates depend on property type and building size and rise with inflation: $129 base for single-family homes, $249 base for multifamily (capped at $50,000), $799 base for non-residential and mixed-use (capped at $400,000), and $392 for vacant land over 2,000 sq ft. Most homeowners 65 or older living in their home would get a discount or pay nothing.",
      es: "Crea un impuesto anual por parcela del 1 de julio de 2027 al 30 de junio de 2042, destinado solo al servicio de Muni, con ingresos estimados de $177 millones al año. Las tasas dependen del tipo de propiedad y del tamaño del edificio y se ajustan por inflación: base de $129 para viviendas unifamiliares, $249 para multifamiliares (tope de $50,000), $799 para no residenciales y de uso mixto (tope de $400,000) y $392 para terrenos sin edificar de más de 2,000 pies cuadrados. La mayoría de los propietarios de 65 años o más que viven en su casa recibirían un descuento o no pagarían."
    },
    cost: {
      en: "The Controller estimates about $177 million a year for Muni starting in 2027-28, with administration costs of $2-3 million to start and $4-6 million a year. Landlords could pass up to 50% of the tax to rent-controlled tenants, up to $65 per unit per year.",
      es: "La Contraloría estima unos $177 millones al año para Muni desde 2027-28, con costos de administración de $2-3 millones al inicio y $4-6 millones al año. Los propietarios podrían trasladar hasta el 50% del impuesto a inquilinos con control de renta, hasta $65 por unidad al año."
    },
    yes: {
      en: "The City would fund Muni service through a new annual parcel tax on real estate ($129 up to $400,000 per parcel, about $177 million a year, for 15 years).",
      es: "La Ciudad financiaría el servicio de Muni mediante un nuevo impuesto anual por parcela sobre bienes inmuebles (de $129 hasta $400,000 por parcela, unos $177 millones al año, durante 15 años)."
    },
    no: {
      en: "The parcel tax for Muni would not be created.",
      es: "No se crearía el impuesto por parcela para Muni."
    },
    debate: {
      en: "Official argument for: Mayor Daniel Lurie, Speaker Emerita Nancy Pelosi, Senator Scott Wiener, supervisors, labor, business and tenant groups. Official argument against: San Francisco Republican Party.",
      es: "Argumento oficial a favor: el alcalde Daniel Lurie, la presidenta emérita de la Cámara Nancy Pelosi, el senador Scott Wiener, supervisores y grupos laborales, empresariales y de inquilinos. Argumento oficial en contra: Partido Republicano de San Francisco."
    },
    officialUrl: "https://www.sf.gov/qualified-ballot-measures"
  },
  {
    id: "sf-I",
    letter: "I",
    body: {
      en: "City and County of San Francisco",
      es: "Ciudad y Condado de San Francisco"
    },
    scope: "city",
    appearsIn: ["san-francisco"],
    allAddresses: true,
    kind: "tax",
    threshold: "majority",
    placedBy: "petition",
    title: {
      en: "Dedicates part of large-property transfer tax to affordable housing",
      es: "Destina parte del impuesto de transferencia de grandes inmuebles a vivienda asequible"
    },
    summary: {
      en: "Splits the transfer tax on real estate sales of $10 million or more in half: the general tax drops (5.5% to 2.75% for $10-25 million; 6% to 3% for $25 million+) and an equal new tax is dedicated only to affordable housing, so total rates stay at 5.5%-6%. At least 60% would go to housing production (half to social housing), 25% to acquisition/rehabilitation and 10% to tenant stabilization and homelessness prevention. It exempts some first sales of new multifamily housing from the new tax and limits the Board's ability to cut the tax without voters.",
      es: "Divide a la mitad el impuesto de transferencia sobre ventas de inmuebles de $10 millones o más: el impuesto general baja (del 5.5% al 2.75% entre $10 y $25 millones; del 6% al 3% desde $25 millones) y un nuevo impuesto igual se destina solo a vivienda asequible, por lo que la tasa total sigue entre 5.5% y 6%. Al menos el 60% iría a producción de vivienda (la mitad a vivienda social), el 25% a adquisición o rehabilitación y el 10% a estabilización de inquilinos y prevención de la falta de vivienda. Exime del nuevo impuesto algunas primeras ventas de vivienda multifamiliar nueva y limita la facultad de la Junta de reducir el impuesto sin el voto del electorado."
    },
    cost: {
      en: "The Controller estimates a revenue decrease of about $1 million a year, and that about $120 million a year would shift from the General Fund to the dedicated housing fund, increasing the projected General Fund deficit by that amount.",
      es: "La Contraloría estima una disminución de ingresos de aproximadamente $1 millón al año y que unos $120 millones anuales pasarían del Fondo General al fondo dedicado a vivienda, lo que aumentaría en esa cantidad el déficit proyectado del Fondo General."
    },
    yes: {
      en: "Half of the transfer tax revenue from certain sales over $10 million would be permanently dedicated to affordable housing, including social housing and housing assistance, with certain sales exempt from the dedicated portion.",
      es: "La mitad de los ingresos del impuesto de transferencia de ciertas ventas de más de $10 millones se destinaría permanentemente a vivienda asequible, incluida vivienda social y asistencia para la vivienda, con ciertas ventas exentas de esa parte."
    },
    no: {
      en: "These changes would not be made.",
      es: "No se harían estos cambios."
    },
    debate: {
      en: "Official argument for: Democratic Socialists of America - San Francisco, San Franciscans for Social Housing, SEIU 1021, tenant and housing groups. Official argument against: Quentin L. Kopp and the San Francisco Taxpayers Association.",
      es: "Argumento oficial a favor: Democratic Socialists of America - San Francisco, San Franciscans for Social Housing, SEIU 1021 y grupos de inquilinos y vivienda. Argumento oficial en contra: Quentin L. Kopp y la Asociación de Contribuyentes de San Francisco."
    },
    officialUrl: "https://www.sf.gov/qualified-ballot-measures"
  },
  {
    id: "sf-J",
    letter: "J",
    body: {
      en: "City and County of San Francisco",
      es: "Ciudad y Condado de San Francisco"
    },
    scope: "city",
    appearsIn: ["san-francisco"],
    allAddresses: true,
    kind: "tax",
    threshold: "majority",
    placedBy: "body",
    title: {
      en: "Ends transfer-tax break for foreclosed large properties",
      es: "Elimina la exención del impuesto de transferencia por ejecución hipotecaria"
    },
    summary: {
      en: "Starting March 1, 2027, properties such as commercial, industrial and large residential buildings that are transferred to a lender through foreclosure (or to avoid it) would pay the transfer tax (0.5% to 6%) on their full market value, instead of the current partial exemption. Single-family homes, buildings with fewer than five units, and small mixed-use buildings keep the exemption.",
      es: "A partir del 1 de marzo de 2027, los inmuebles como edificios comerciales, industriales y residenciales grandes que se transfieran a un acreedor por ejecución hipotecaria (o para evitarla) pagarían el impuesto de transferencia (del 0.5% al 6%) sobre su valor total de mercado, en lugar de la exención parcial actual. Las viviendas unifamiliares, los edificios de menos de cinco unidades y los pequeños edificios de uso mixto conservan la exención."
    },
    cost: {
      en: "The Controller estimates an average of $100 million to $150 million a year over the first five years, highly unpredictable and likely to decline as foreclosures fall.",
      es: "La Contraloría estima un promedio de $100 millones a $150 millones al año durante los primeros cinco años, muy impredecible y probablemente decreciente a medida que bajen las ejecuciones hipotecarias."
    },
    yes: {
      en: "A transfer tax of 0.5% to 6% of fair market value would permanently apply to properties such as commercial, industrial and large residential buildings transferred to a lender because of foreclosure.",
      es: "Se aplicaría permanentemente un impuesto de transferencia del 0.5% al 6% del valor de mercado a inmuebles comerciales, industriales y residenciales grandes transferidos a un acreedor por ejecución hipotecaria."
    },
    no: {
      en: "These changes would not be made.",
      es: "No se harían estos cambios."
    },
    debate: {
      en: "Official argument for: Supervisor Bilal Mahmood, Board President Rafael Mandelman, other supervisors, labor unions and the San Francisco Democratic Party. Official argument against: Quentin L. Kopp and the San Francisco Taxpayers Association.",
      es: "Argumento oficial a favor: el supervisor Bilal Mahmood, el presidente de la Junta Rafael Mandelman, otros supervisores, sindicatos y el Partido Demócrata de San Francisco. Argumento oficial en contra: Quentin L. Kopp y la Asociación de Contribuyentes de San Francisco."
    },
    officialUrl: "https://www.sf.gov/qualified-ballot-measures",
    placement: { cardId: "c3f6c106-23c2-4d71-991c-edebbc776920", date: "2026-07-28", body: { en: "Board of Supervisors", es: "Junta de Supervisores" } }
  },
  {
    id: "sf-RTM",
    body: {
      en: "Public Transit Revenue Measure District (Bay Area)",
      es: "Distrito de la Medida de Ingresos para el Transporte Público (Área de la Bahía)"
    },
    scope: "regional",
    appearsIn: ["san-francisco"],
    allAddresses: true,
    kind: "tax",
    threshold: "majority",
    placedBy: "petition",
    title: {
      en: "Regional Transit Measure: Bay Area sales tax for transit for 14 years",
      es: "Medida Regional de Transporte: impuesto sobre las ventas para el transporte público del Área de la Bahía por 14 años"
    },
    summary: {
      en: "Bay Area sales tax for 14 years: 1% in San Francisco and 0.5% in Alameda, Contra Costa, San Mateo and Santa Clara counties, raising about $980 million a year. Money goes through MTC to BART, Muni, Caltrain, AC Transit, VTA and other transit by set shares per county, with an independent oversight committee and efficiency reviews. Road repaving is an allowed use in the other four counties but not in San Francisco.",
      es: "Impuesto sobre las ventas en el Área de la Bahía durante 14 años: 1% en San Francisco y 0.5% en los condados de Alameda, Contra Costa, San Mateo y Santa Clara, que recaudaría unos $980 millones al año. Los fondos se distribuyen a través de la MTC a BART, Muni, Caltrain, AC Transit, VTA y otros servicios según porcentajes fijos por condado, con un comité de supervisión independiente y revisiones de eficiencia. La repavimentación de calles es un uso permitido en los otros cuatro condados, pero no en San Francisco."
    },
    yes: {
      en: "A 1% sales tax in San Francisco (0.5% in the other four counties) would be imposed for 14 years to fund public transit.",
      es: "Se impondría un impuesto sobre las ventas del 1% en San Francisco (0.5% en los otros cuatro condados) durante 14 años para financiar el transporte público."
    },
    no: {
      en: "The regional transit sales tax would not be imposed.",
      es: "No se impondría el impuesto regional sobre las ventas para el transporte público."
    },
    debate: {
      en: "Official argument for (SF pamphlet): Mayor Daniel Lurie, Senator Scott Wiener, City Attorney David Chiu, San Francisco Democratic Party, League of Women Voters of the Bay Area and others. Official argument against: Quentin L. Kopp and the San Francisco Taxpayers Association.",
      es: "Argumento oficial a favor (folleto de SF): el alcalde Daniel Lurie, el senador Scott Wiener, el fiscal municipal David Chiu, el Partido Demócrata de San Francisco, la Liga de Mujeres Votantes del Área de la Bahía y otros. Argumento oficial en contra: Quentin L. Kopp y la Asociación de Contribuyentes de San Francisco."
    },
    officialUrl: "https://www.sf.gov/qualified-ballot-measures"
  },
  {
    id: "smc-county-L",
    letter: "L",
    body: {
      en: "San Mateo County",
      es: "Condado de San Mateo"
    },
    scope: "county",
    appearsIn: ["san-mateo-county", "foster-city", "san-mateo-city", "menlo-park", "east-palo-alto", "redwood-city"],
    allAddresses: true,
    kind: "charter",
    threshold: "majority",
    placedBy: "body",
    title: {
      en: "Makes extreme-weather resilience a County Charter priority",
      es: "Hace de la resiliencia ante el clima extremo una prioridad en la Carta del Condado"
    },
    summary: {
      en: "Adds a paragraph to the County Charter's preamble saying long-term resilience against extreme weather (fire, flood, wind, rain, heat, drought and sea level rise) is a County priority, to be pursued together with cities, districts and other public agencies. It does not change any other part of the Charter.",
      es: "Agrega un párrafo al preámbulo de la Carta del Condado que declara que la resiliencia a largo plazo ante el clima extremo (incendios, inundaciones, viento, lluvia, calor, sequía y aumento del nivel del mar) es una prioridad del Condado, que se trabajará junto con ciudades, distritos y otras agencias públicas. No cambia ninguna otra parte de la Carta."
    },
    yes: {
      en: "The Charter preamble would state that long-term resilience to extreme weather is a County priority.",
      es: "El preámbulo de la Carta declararía que la resiliencia a largo plazo ante el clima extremo es una prioridad del Condado."
    },
    no: {
      en: "The Charter preamble would not be changed.",
      es: "El preámbulo de la Carta no cambiaría."
    },
    debate: {
      en: "The county's measure list shows no official arguments for or against this measure.",
      es: "La lista de medidas del condado no muestra argumentos oficiales a favor ni en contra de esta medida."
    },
    officialUrl: "https://smcacre.gov/elections/november-3-2026-statewide-general-election",
    placement: { cardId: "14febdb7-aec5-482c-be7d-cae55461db1e", date: "2026-06-09", body: { en: "Board of Supervisors", es: "Junta de Supervisores" } }
  },
  {
    id: "smc-county-AA",
    letter: "AA",
    body: {
      en: "San Mateo County",
      es: "Condado de San Mateo"
    },
    scope: "county",
    appearsIn: ["san-mateo-county", "foster-city", "san-mateo-city", "menlo-park", "east-palo-alto", "redwood-city"],
    allAddresses: true,
    kind: "charter",
    threshold: "majority",
    placedBy: "body",
    title: {
      en: "Adds a civil rights and equal protection statement to County Charter",
      es: "Agrega a la Carta del Condado una declaración sobre derechos civiles e igualdad"
    },
    summary: {
      en: "Adds a paragraph to the County Charter's preamble affirming the County's commitment to the dignity, civil rights and equal protection of all County residents, in a way that promotes equity, fairness, inclusion, belonging, accessibility and opportunity. It does not change any other part of the Charter.",
      es: "Agrega un párrafo al preámbulo de la Carta del Condado que afirma el compromiso del Condado con la dignidad, los derechos civiles y la igual protección de todos sus residentes, de una manera que promueva la equidad, la justicia, la inclusión, la pertenencia, la accesibilidad y la oportunidad. No cambia ninguna otra parte de la Carta."
    },
    yes: {
      en: "The Charter preamble would affirm the County's commitment to the dignity, civil rights and equal protection of all residents.",
      es: "El preámbulo de la Carta afirmaría el compromiso del Condado con la dignidad, los derechos civiles y la igual protección de todos los residentes."
    },
    no: {
      en: "The Charter preamble would not be changed.",
      es: "El preámbulo de la Carta no cambiaría."
    },
    debate: {
      en: "The county's measure list shows no official arguments for or against this measure.",
      es: "La lista de medidas del condado no muestra argumentos oficiales a favor ni en contra de esta medida."
    },
    officialUrl: "https://smcacre.gov/elections/november-3-2026-statewide-general-election",
    placement: { cardId: "14febdb7-aec5-482c-be7d-cae55461db1e", date: "2026-06-09", body: { en: "Board of Supervisors", es: "Junta de Supervisores" } }
  },
  {
    id: "smc-county-J",
    letter: "J",
    body: {
      en: "San Mateo County",
      es: "Condado de San Mateo"
    },
    scope: "county",
    appearsIn: ["san-mateo-county", "foster-city", "san-mateo-city", "menlo-park", "east-palo-alto", "redwood-city"],
    allAddresses: true,
    kind: "charter",
    threshold: "majority",
    placedBy: "body",
    title: {
      en: "Gives supervisors 60 days to fill elected-office vacancies",
      es: "Da a los supervisores 60 días para llenar vacantes en cargos electos"
    },
    summary: {
      en: "When an elected County office other than a supervisor seat becomes vacant, the Board of Supervisors would have 60 days instead of 30 to either appoint someone or call a special election. Before appointing someone, the Board would have to hold at least one public meeting to hear comments on the appointment and the candidates' qualifications. If the Board does not act within 60 days, the elections officer must still call a special election.",
      es: "Cuando quede vacante un cargo electo del Condado que no sea de supervisor, la Junta de Supervisores tendría 60 días en lugar de 30 para nombrar a alguien o convocar una elección especial. Antes de hacer un nombramiento, la Junta tendría que realizar al menos una reunión pública para escuchar comentarios sobre el nombramiento y las calificaciones de los candidatos. Si la Junta no actúa en 60 días, el funcionario de elecciones aún debe convocar una elección especial."
    },
    yes: {
      en: "The Board would have 60 days to fill such a vacancy and would have to hold a public meeting before any appointment.",
      es: "La Junta tendría 60 días para llenar esa vacante y tendría que realizar una reunión pública antes de cualquier nombramiento."
    },
    no: {
      en: "The Board would keep the current 30-day deadline, with no public meeting required before an appointment.",
      es: "La Junta mantendría el plazo actual de 30 días, sin la obligación de realizar una reunión pública antes de un nombramiento."
    },
    debate: {
      en: "The county's measure list shows no official arguments for or against this measure.",
      es: "La lista de medidas del condado no muestra argumentos oficiales a favor ni en contra de esta medida."
    },
    officialUrl: "https://smcacre.gov/elections/november-3-2026-statewide-general-election",
    placement: { cardId: "14febdb7-aec5-482c-be7d-cae55461db1e", date: "2026-06-09", body: { en: "Board of Supervisors", es: "Junta de Supervisores" } }
  },
  {
    id: "smc-county-U",
    letter: "U",
    body: {
      en: "San Mateo County",
      es: "Condado de San Mateo"
    },
    scope: "county",
    appearsIn: ["san-mateo-county", "foster-city", "san-mateo-city", "menlo-park", "east-palo-alto", "redwood-city"],
    allAddresses: true,
    kind: "charter",
    threshold: "majority",
    placedBy: "body",
    title: {
      en: "Independent commission would redraw supervisor districts",
      es: "Una comisión independiente trazaría los distritos de supervisores"
    },
    summary: {
      en: "After each federal census, the five supervisor districts would be redrawn by an independent redistricting commission under state election law, not by the Board of Supervisors through an ordinance. Supervisors would still be elected by district, would have to live in their district, and would keep four-year terms with a limit of three consecutive terms.",
      es: "Después de cada censo federal, una comisión independiente de redistribución, regida por la ley electoral estatal, volvería a trazar los cinco distritos de supervisores, en lugar de que lo haga la Junta de Supervisores por ordenanza. Los supervisores se seguirían eligiendo por distrito, tendrían que vivir en su distrito y mantendrían periodos de cuatro años con un límite de tres periodos consecutivos."
    },
    yes: {
      en: "An independent redistricting commission would draw supervisor district lines after each census.",
      es: "Una comisión independiente de redistribución trazaría los límites de los distritos de supervisores después de cada censo."
    },
    no: {
      en: "The Board of Supervisors would keep adopting district lines by ordinance.",
      es: "La Junta de Supervisores seguiría aprobando los límites de los distritos por ordenanza."
    },
    debate: {
      en: "A group of voters and associations filed the official argument in favor. The county's measure list shows no argument against.",
      es: "Un grupo de votantes y asociaciones presentó el argumento oficial a favor. La lista de medidas del condado no muestra un argumento en contra."
    },
    officialUrl: "https://smcacre.gov/elections/november-3-2026-statewide-general-election",
    placement: { cardId: "14febdb7-aec5-482c-be7d-cae55461db1e", date: "2026-06-09", body: { en: "Board of Supervisors", es: "Junta de Supervisores" } }
  },
  {
    id: "smc-regional-RTM",
    body: {
      en: "Public Transit Revenue Measure District (Bay Area)",
      es: "Distrito de la Medida de Ingresos para el Transporte Público (Área de la Bahía)"
    },
    scope: "regional",
    appearsIn: ["san-mateo-county", "foster-city", "san-mateo-city", "menlo-park", "east-palo-alto", "redwood-city"],
    allAddresses: true,
    kind: "tax",
    threshold: "majority",
    placedBy: "petition",
    title: {
      en: "Regional Transit Measure: Bay Area sales tax for transit for 14 years",
      es: "Medida Regional de Transporte: impuesto sobre las ventas para el transporte público del Área de la Bahía por 14 años"
    },
    summary: {
      en: "A sales tax of 0.5% in Alameda, Contra Costa, San Mateo and Santa Clara counties and 1% in San Francisco, for 14 years, estimated to raise about $980 million a year. After set costs, the money would go to transit agencies and county transportation agencies under formulas that vary by county, plus transfer discounts, Clipper START, accessibility, wayfinding and repaving of roads used by fixed-route transit. It would be subject to SB 63 accountability rules and an independent oversight committee.",
      es: "Un impuesto sobre las ventas de 0.5% en los condados de Alameda, Contra Costa, San Mateo y Santa Clara y de 1% en San Francisco, durante 14 años, que se estima recaudaría unos $980 millones al año. Después de ciertos costos, el dinero iría a agencias de transporte público y agencias de transporte de cada condado según fórmulas que varían por condado, además de descuentos en transbordos, Clipper START, accesibilidad, señalización y repavimentación de calles por donde pasa el transporte de ruta fija. Estaría sujeto a las reglas de rendición de cuentas de la ley SB 63 y a un comité de supervisión independiente."
    },
    cost: {
      en: "0.5% added to the sales tax in San Mateo County (50 cents per $100 of taxable purchases) for 14 years. It would not count toward the state cap on combined local sales tax rates.",
      es: "Se sumaría 0.5% al impuesto sobre las ventas en el Condado de San Mateo (50 centavos por cada $100 de compras sujetas a impuesto) durante 14 años. No contaría para el límite estatal de tasas locales combinadas del impuesto sobre las ventas."
    },
    yes: {
      en: "The 0.5% sales tax (1% in San Francisco) would be imposed across the five counties for 14 years to fund public transit.",
      es: "Se aplicaría en los cinco condados el impuesto sobre las ventas de 0.5% (1% en San Francisco) durante 14 años para financiar el transporte público."
    },
    no: {
      en: "The tax would not be imposed.",
      es: "No se aplicaría el impuesto."
    },
    debate: {
      en: "The county lists official arguments for and against this measure, plus rebuttals to both.",
      es: "El condado publica argumentos oficiales a favor y en contra de esta medida, además de refutaciones a ambos."
    },
    officialUrl: "https://smcacre.gov/elections/november-3-2026-statewide-general-election"
  },
  {
    id: "smcccd-V",
    letter: "V",
    body: {
      en: "San Mateo County Community College District",
      es: "Distrito de Colegios Comunitarios del Condado de San Mateo"
    },
    scope: "school",
    appearsIn: ["san-mateo-county", "foster-city", "san-mateo-city", "menlo-park", "east-palo-alto", "redwood-city"],
    allAddresses: true,
    kind: "bond",
    threshold: "fifty-five",
    placedBy: "body",
    title: {
      en: "$848 million bond for community college facilities",
      es: "Bono de $848 millones para instalaciones de los colegios comunitarios"
    },
    summary: {
      en: "The district (Cañada, College of San Mateo and Skyline) could borrow up to $848 million to repair and upgrade buildings, utilities, roofs, safety and security systems, technology, roads and parking, and to build or acquire facilities. The money cannot pay teacher or administrator salaries. An independent citizens' oversight committee and annual audits are required.",
      es: "El distrito (Cañada, College of San Mateo y Skyline) podría pedir prestado hasta $848 millones para reparar y modernizar edificios, servicios básicos, techos, sistemas de seguridad, tecnología, calles y estacionamientos, y para construir o adquirir instalaciones. El dinero no puede usarse para salarios de maestros ni de administradores. Se exigen un comité independiente de supervisión ciudadana y auditorías anuales."
    },
    cost: {
      en: "The district's best estimate of the highest annual tax rate is $18 per $100,000 of assessed value. Total repayment, including interest, is estimated at about $1.35 billion, with the bonds expected to be paid off by June 2049.",
      es: "La mejor estimación del distrito de la tasa anual más alta es de $18 por cada $100,000 de valor tasado. Se estima que el pago total, con intereses, sería de unos $1,350 millones, y se espera terminar de pagar los bonos para junio de 2049."
    },
    yes: {
      en: "The district could issue up to $848 million in bonds for the listed projects.",
      es: "El distrito podría emitir hasta $848 millones en bonos para los proyectos de la lista."
    },
    no: {
      en: "The district could not issue the bonds.",
      es: "El distrito no podría emitir los bonos."
    },
    debate: {
      en: "The county lists official arguments for and against this measure, plus rebuttals to both.",
      es: "El condado publica argumentos oficiales a favor y en contra de esta medida, además de refutaciones a ambos."
    },
    officialUrl: "https://smcacre.gov/elections/november-3-2026-statewide-general-election"
  },
  {
    id: "smfcsd-W",
    letter: "W",
    body: {
      en: "San Mateo-Foster City School District",
      es: "Distrito Escolar San Mateo-Foster City"
    },
    scope: "school",
    appearsIn: ["san-mateo-county", "foster-city", "san-mateo-city"],
    allAddresses: false,
    kind: "bond",
    threshold: "fifty-five",
    placedBy: "body",
    title: {
      en: "$498 million bond for San Mateo-Foster City schools",
      es: "Bono de $498 millones para las escuelas de San Mateo-Foster City"
    },
    summary: {
      en: "The K-8 district could borrow up to $498 million for projects that include skilled-trades shop classes, science and math classrooms and labs, roof and window replacement, fire alarms and emergency communications, teacher and staff housing, accessibility, and school safety and security. The money cannot pay teacher or administrator salaries. An independent citizens' oversight committee and annual audits are required.",
      es: "El distrito de kínder a 8.º grado podría pedir prestado hasta $498 millones para proyectos que incluyen talleres de oficios técnicos, salones y laboratorios de ciencias y matemáticas, reemplazo de techos y ventanas, alarmas contra incendios y comunicaciones de emergencia, vivienda para maestros y personal, accesibilidad, y seguridad escolar. El dinero no puede usarse para salarios de maestros ni de administradores. Se exigen un comité independiente de supervisión ciudadana y auditorías anuales."
    },
    cost: {
      en: "The district's best estimate of the average annual tax rate is $29 per $100,000 of assessed value. Total repayment, including interest, is estimated at about $900 million, with payments expected to last until fiscal year 2054-55.",
      es: "La mejor estimación del distrito de la tasa anual promedio es de $29 por cada $100,000 de valor tasado. Se estima que el pago total, con intereses, sería de unos $900 millones, con pagos que durarían hasta el año fiscal 2054-55."
    },
    yes: {
      en: "The district could issue up to $498 million in bonds for the listed projects.",
      es: "El distrito podría emitir hasta $498 millones en bonos para los proyectos de la lista."
    },
    no: {
      en: "The district could not issue the bonds.",
      es: "El distrito no podría emitir los bonos."
    },
    debate: {
      en: "The county lists official arguments for and against this measure, plus rebuttals to both.",
      es: "El condado publica argumentos oficiales a favor y en contra de esta medida, además de refutaciones a ambos."
    },
    officialUrl: "https://smcacre.gov/elections/november-3-2026-statewide-general-election"
  },
  {
    id: "sm-city-H",
    letter: "H",
    body: {
      en: "City of San Mateo",
      es: "Ciudad de San Mateo"
    },
    scope: "city",
    appearsIn: ["san-mateo-city"],
    allAddresses: true,
    kind: "tax",
    threshold: "majority",
    placedBy: "body",
    title: {
      en: "Raises San Mateo's local sales tax by a quarter cent",
      es: "Aumenta un cuarto de centavo el impuesto local sobre las ventas de San Mateo"
    },
    summary: {
      en: "San Mateo's local sales (transactions and use) tax would rise from 0.25% to 0.50%, adding 25 cents per $100 of purchases, until voters end it. It is a general tax, so the estimated $7 million a year could be spent on any City purpose. Groceries and prescription medicine are exempt under state law. An annual audit and a five-member public committee to review the revenue and spending are required.",
      es: "El impuesto local sobre las ventas (transacciones y uso) de San Mateo subiría de 0.25% a 0.50%, es decir, 25 centavos más por cada $100 de compras, hasta que los votantes lo eliminen. Es un impuesto general, por lo que los aproximadamente $7 millones al año podrían usarse para cualquier fin de la Ciudad. Los alimentos y las medicinas con receta están exentos por ley estatal. Se exigen una auditoría anual y un comité público de cinco miembros que revise los ingresos y gastos."
    },
    cost: {
      en: "An extra 0.25% sales tax, estimated to raise about $7 million a year, with no end date. Collection would start the first calendar quarter beginning 110 days after the Council certifies the result.",
      es: "Un 0.25% adicional de impuesto sobre las ventas, que se estima recaudaría unos $7 millones al año, sin fecha de vencimiento. El cobro empezaría el primer trimestre calendario que inicie 110 días después de que el Concejo certifique el resultado."
    },
    yes: {
      en: "The City's sales tax would rise from 0.25% to 0.50% until voters end it.",
      es: "El impuesto sobre las ventas de la Ciudad subiría de 0.25% a 0.50% hasta que los votantes lo eliminen."
    },
    no: {
      en: "The City's sales tax would stay at 0.25%.",
      es: "El impuesto sobre las ventas de la Ciudad se mantendría en 0.25%."
    },
    debate: {
      en: "The county lists official arguments for and against this measure, plus rebuttals to both.",
      es: "El condado publica argumentos oficiales a favor y en contra de esta medida, además de refutaciones a ambos."
    },
    officialUrl: "https://smcacre.gov/elections/november-3-2026-statewide-general-election",
    placement: { cardId: "96d7d0df-ff48-4de6-9519-0cfb72074db5", date: "2026-07-20", body: { en: "City Council", es: "Concejo Municipal" } }
  },
  {
    id: "sm-city-F",
    letter: "F",
    body: {
      en: "City of San Mateo",
      es: "Ciudad de San Mateo"
    },
    scope: "city",
    appearsIn: ["san-mateo-city"],
    allAddresses: true,
    kind: "charter",
    threshold: "majority",
    placedBy: "body",
    title: {
      en: "Updates San Mateo City Charter for district elections and procedures",
      es: "Actualiza la Carta de San Mateo sobre elecciones por distrito y procedimientos"
    },
    summary: {
      en: "Changes the City Charter to reflect the district elections San Mateo has used since 2022, including redrawing districts after each census. It gives the Council 60 days instead of 30 to fill a Council vacancy and lets a member be absent from the City for 60 days instead of 30 before forfeiting office. The Council would set its meeting schedule by resolution. It also removes outdated provisions, lets emergency ordinances be published as summaries, ends the low-bid rule for the legal-notice newspaper contract, and adds gender-neutral wording.",
      es: "Cambia la Carta de la Ciudad para reflejar las elecciones por distrito que San Mateo usa desde 2022, incluido el nuevo trazado de distritos después de cada censo. Da al Concejo 60 días en lugar de 30 para llenar una vacante y permite que un miembro esté fuera de la Ciudad 60 días en lugar de 30 antes de perder su cargo. El Concejo fijaría su calendario de reuniones por resolución. También elimina disposiciones obsoletas, permite publicar un resumen de las ordenanzas de emergencia, elimina la regla de adjudicar al postor más bajo el contrato del periódico para avisos legales y agrega lenguaje de género neutro."
    },
    yes: {
      en: "The City Charter would be amended with these changes.",
      es: "La Carta de la Ciudad se modificaría con estos cambios."
    },
    no: {
      en: "The City Charter would stay as it is.",
      es: "La Carta de la Ciudad quedaría como está."
    },
    debate: {
      en: "The Council authorized Deputy Mayor Nicole Fernandez and Council Member Cwirko-Godycki to write the argument in favor. The county's measure list shows no argument against.",
      es: "El Concejo autorizó a la vicealcaldesa Nicole Fernandez y a la concejal Cwirko-Godycki a redactar el argumento a favor. La lista de medidas del condado no muestra un argumento en contra."
    },
    officialUrl: "https://smcacre.gov/elections/november-3-2026-statewide-general-election",
    placement: { cardId: "a3fa2e85-b1bb-45e7-836b-8a2375361299", date: "2026-07-20", body: { en: "City Council", es: "Concejo Municipal" } }
  },
  {
    id: "mp-P",
    letter: "P",
    body: {
      en: "City of Menlo Park",
      es: "Ciudad de Menlo Park"
    },
    scope: "city",
    appearsIn: ["menlo-park"],
    allAddresses: true,
    kind: "initiative",
    threshold: "majority",
    placedBy: "petition",
    title: {
      en: "Requires a citywide vote before reducing downtown parking plazas",
      es: "Exige una votación antes de reducir los estacionamientos públicos del centro"
    },
    summary: {
      en: "This citizen initiative adds a 'Downtown Parking Plazas Ordinance' covering eight City-owned downtown parking lots. The City could not sell, lease or otherwise transfer them, declare them surplus land, build on them in a way that permanently reduces parking, or change their use to reduce parking unless voters approve. Repairs that preserve or add parking, and temporary events of up to three days such as farmers' markets, are exempt. It reaches back to actions taken since May 15, 2025, and voter approval would also be needed before the Housing Element plan for at least 345 affordable homes on the lots goes ahead if it would reduce parking access or convenience.",
      es: "Esta iniciativa ciudadana agrega una 'Ordenanza de Estacionamientos del Centro' que abarca ocho estacionamientos públicos de la Ciudad en el centro. La Ciudad no podría venderlos, arrendarlos ni transferirlos de otro modo, declararlos terrenos excedentes, construir en ellos de forma que reduzca permanentemente el estacionamiento, ni cambiar su uso para reducir el estacionamiento sin la aprobación de los votantes. Quedan exentas las reparaciones que mantengan o amplíen el estacionamiento y los eventos temporales de hasta tres días, como los mercados de agricultores. Es retroactiva a acciones tomadas desde el 15 de mayo de 2025, y también se necesitaría la aprobación de los votantes antes de llevar a cabo el plan del Elemento de Vivienda para al menos 345 viviendas asequibles en esos lotes si redujera el acceso o la comodidad del estacionamiento."
    },
    yes: {
      en: "The City would need voter approval before taking any of these actions on the downtown parking plazas.",
      es: "La Ciudad necesitaría la aprobación de los votantes antes de tomar cualquiera de estas acciones en los estacionamientos del centro."
    },
    no: {
      en: "The City Council would keep deciding how the parking plazas are used, without a required public vote.",
      es: "El Concejo Municipal seguiría decidiendo el uso de los estacionamientos, sin que se requiera una votación pública."
    },
    debate: {
      en: "The county lists official arguments for and against this measure, plus rebuttals to both.",
      es: "El condado publica argumentos oficiales a favor y en contra de esta medida, además de refutaciones a ambos."
    },
    officialUrl: "https://smcacre.gov/elections/november-3-2026-statewide-general-election"
  },
  {
    id: "epa-O",
    letter: "O",
    body: {
      en: "City of East Palo Alto",
      es: "Ciudad de East Palo Alto"
    },
    scope: "city",
    appearsIn: ["east-palo-alto"],
    allAddresses: true,
    kind: "bond",
    threshold: "two-thirds",
    placedBy: "body",
    title: {
      en: "$125 million bond for civic center, water, storm drains and parks",
      es: "Bono de $125 millones para centro cívico, agua, drenaje pluvial y parques"
    },
    summary: {
      en: "East Palo Alto could borrow up to $125 million, repaid by property taxes. Projects: land for a civic center with a police station and emergency operations center (about 20,000 sq ft) and a building of about 100,000 sq ft for a library, City Hall and community facilities; water system upgrades; storm drain and flood protection work; and land for parks and recreation, including a track and field facility. Annual independent audits and yearly reports to the Council are required.",
      es: "East Palo Alto podría pedir prestado hasta $125 millones, que se pagarían con impuestos a la propiedad. Proyectos: terreno para un centro cívico con una estación de policía y un centro de operaciones de emergencia (unos 20,000 pies cuadrados) y un edificio de unos 100,000 pies cuadrados para biblioteca, Ayuntamiento e instalaciones comunitarias; mejoras al sistema de agua; obras de drenaje pluvial y protección contra inundaciones; y terreno para parques y recreación, incluida una pista de atletismo. Se exigen auditorías independientes anuales e informes anuales al Concejo."
    },
    cost: {
      en: "The City estimates an average levy of $105.26 per $100,000 of assessed value (about $8.94 million a year), with a highest rate of about $114.41 per $100,000 starting around 2028-29. Total principal and interest are estimated at $268,205,658, with the last tax collected in fiscal year 2057-58.",
      es: "La Ciudad estima un cobro promedio de $105.26 por cada $100,000 de valor tasado (unos $8.94 millones al año), con una tasa máxima de unos $114.41 por cada $100,000 a partir de alrededor de 2028-29. Se estima un total de capital e intereses de $268,205,658; el último cobro sería en el año fiscal 2057-58."
    },
    yes: {
      en: "The City could issue up to $125 million in general obligation bonds for the listed projects.",
      es: "La Ciudad podría emitir hasta $125 millones en bonos de obligación general para los proyectos de la lista."
    },
    no: {
      en: "The City could not issue the bonds.",
      es: "La Ciudad no podría emitir los bonos."
    },
    debate: {
      en: "The county lists official arguments for and against this measure and a rebuttal to the argument against.",
      es: "El condado publica argumentos oficiales a favor y en contra de esta medida y una refutación al argumento en contra."
    },
    officialUrl: "https://smcacre.gov/elections/november-3-2026-statewide-general-election",
    placement: { cardId: "d2647f01-ae69-45d5-b391-73e2733df4f4", date: "2026-07-21", body: { en: "City Council", es: "Concejo Municipal" } }
  },
  {
    id: "epa-CC",
    letter: "CC",
    body: {
      en: "City of East Palo Alto",
      es: "Ciudad de East Palo Alto"
    },
    scope: "city",
    appearsIn: ["east-palo-alto"],
    allAddresses: true,
    kind: "ordinance",
    threshold: "majority",
    placedBy: "body",
    title: {
      en: "Sets term limits for East Palo Alto City Council",
      es: "Establece límites de mandato para el Concejo Municipal de East Palo Alto"
    },
    summary: {
      en: "Council members could serve at most three consecutive four-year terms (12 years). A partial term of more than two years would count as a full term. Only terms starting after the measure takes effect (December 2026) would count, so earlier service would not count toward the limit.",
      es: "Los concejales podrían servir como máximo tres periodos consecutivos de cuatro años (12 años). Un periodo parcial de más de dos años contaría como periodo completo. Solo contarían los periodos que empiecen después de que la medida entre en vigor (diciembre de 2026), por lo que el servicio anterior no contaría para el límite."
    },
    yes: {
      en: "City Council members would be limited to three consecutive full terms.",
      es: "Los concejales quedarían limitados a tres periodos completos consecutivos."
    },
    no: {
      en: "City Council members would have no term limits.",
      es: "Los concejales no tendrían límites de mandato."
    },
    debate: {
      en: "The county lists official arguments for and against this measure and a rebuttal to the argument in favor.",
      es: "El condado publica argumentos oficiales a favor y en contra de esta medida y una refutación al argumento a favor."
    },
    officialUrl: "https://smcacre.gov/elections/november-3-2026-statewide-general-election"
  },
  {
    id: "rwc-E",
    letter: "E",
    body: {
      en: "City of Redwood City",
      es: "Ciudad de Redwood City"
    },
    scope: "city",
    appearsIn: ["redwood-city"],
    allAddresses: true,
    kind: "initiative",
    threshold: "majority",
    placedBy: "petition",
    title: {
      en: "Rent control and expanded eviction protections in Redwood City",
      es: "Control de rentas y más protecciones contra desalojos en Redwood City"
    },
    summary: {
      en: "This citizen initiative replaces Municipal Code Chapter 42. For multifamily units built before February 1, 1995, base rent would be set at the October 29, 2025 level (or the starting rent for later tenancies), and yearly increases would be capped at 60% of local inflation, with a maximum of 5%. Just-cause eviction rules would extend to single-family homes, ADUs, deed-restricted affordable housing and mobile homes. No-fault evictions would require relocation pay of four times the HUD fair market rent or $12,000, whichever is greater, plus $6,000 for elderly or disabled tenants. The City would run a rent program paid for by an annual fee on landlords.",
      es: "Esta iniciativa ciudadana reemplaza el Capítulo 42 del Código Municipal. En unidades multifamiliares construidas antes del 1 de febrero de 1995, la renta base se fijaría en el nivel del 29 de octubre de 2025 (o en la renta inicial para contratos posteriores), y los aumentos anuales se limitarían al 60% de la inflación local, con un máximo de 5%. Las reglas de desalojo con causa justa se extenderían a casas unifamiliares, unidades de vivienda accesoria (ADU), viviendas asequibles con restricciones de escritura y casas móviles. Los desalojos sin culpa del inquilino exigirían un pago de reubicación de cuatro veces la renta justa de mercado de HUD o $12,000, lo que sea mayor, más $6,000 para inquilinos mayores o con discapacidad. La Ciudad administraría un programa de rentas financiado con una cuota anual a los arrendadores."
    },
    cost: {
      en: "The ballot question estimates new City administration at $5 million to $11 million a year, paid by annual fees on rental property owners.",
      es: "La pregunta de la boleta estima que la nueva administración municipal costaría de $5 a $11 millones al año, pagados con cuotas anuales a los propietarios de viviendas de alquiler."
    },
    yes: {
      en: "Chapter 42 would be replaced with rent limits on older multifamily housing, broader just-cause eviction rules, higher relocation pay, and a fee-funded City rent program.",
      es: "El Capítulo 42 se reemplazaría con límites de renta para viviendas multifamiliares más antiguas, reglas más amplias de desalojo con causa justa, pagos de reubicación más altos y un programa municipal de rentas financiado con cuotas."
    },
    no: {
      en: "Current rules would stay, including the yearly rent-increase cap of 5% to 10% on some older units and the current just-cause and relocation rules.",
      es: "Seguirían las reglas actuales, incluido el límite anual de aumento de renta de 5% a 10% en algunas unidades más antiguas y las reglas actuales de causa justa y reubicación."
    },
    debate: {
      en: "The county lists official arguments for and against this measure, plus rebuttals to both.",
      es: "El condado publica argumentos oficiales a favor y en contra de esta medida, además de refutaciones a ambos."
    },
    officialUrl: "https://smcacre.gov/elections/november-3-2026-statewide-general-election",
    placement: { cardId: "b0746bcf-a1b3-44dc-83a1-68a0947b35f6", date: "2026-07-07", body: { en: "City Council", es: "Concejo Municipal" } }
  },
  {
    id: "scc-regional-RTM",
    body: {
      en: "Public Transit Revenue Measure District (Bay Area)",
      es: "Distrito de la Medida de Ingresos para el Transporte Público (Área de la Bahía)"
    },
    scope: "regional",
    appearsIn: ["santa-clara-county", "mountain-view", "los-altos", "los-altos-hills", "los-altos-school-district"],
    allAddresses: true,
    kind: "tax",
    threshold: "majority",
    placedBy: "petition",
    title: {
      en: "Regional Transit Measure: Bay Area sales tax for transit for 14 years",
      es: "Medida Regional de Transporte: impuesto sobre las ventas para el transporte público del Área de la Bahía por 14 años"
    },
    summary: {
      en: "Adds a 0.5% sales tax in Santa Clara, Alameda, Contra Costa and San Mateo counties and a 1% sales tax in San Francisco for 14 years, raising about $980 million a year. The money would go to BART, Caltrain, VTA, SamTrans, AC Transit, Muni and other transit, plus some road and pothole repair, with financial oversight requirements.",
      es: "Agrega un impuesto sobre las ventas de 0.5% en los condados de Santa Clara, Alameda, Contra Costa y San Mateo, y de 1% en San Francisco, durante 14 años, recaudando unos $980 millones al año. El dinero se destinaría a BART, Caltrain, VTA, SamTrans, AC Transit, Muni y otros sistemas de transporte, además de reparación de calles y baches, con requisitos de supervisión financiera."
    },
    cost: {
      en: "About $980,000,000 a year across the five counties, for 14 years (ballot question).",
      es: "Unos $980,000,000 al año en los cinco condados, durante 14 años (pregunta de la boleta)."
    },
    yes: {
      en: "A 0.5% sales tax would be added in Santa Clara County (1% in San Francisco) for 14 years to fund transit and road repairs.",
      es: "Se agregaría un impuesto sobre las ventas de 0.5% en el Condado de Santa Clara (1% en San Francisco) durante 14 años para financiar el transporte público y reparaciones de calles."
    },
    no: {
      en: "The regional transit sales tax would not be added.",
      es: "No se agregaría el impuesto regional sobre las ventas para el transporte público."
    },
    debate: {
      en: "Arguments for and against, and rebuttals to both, were filed with the Santa Clara County Registrar of Voters. The argument in favor was signed by U.S. Rep. Sam Liccardo, Supervisor Margaret Abe-Koga, the Santa Clara County Firefighters (IAFF Local 1165), the League of Women Voters of the Bay Area and an ER nurse.",
      es: "Se presentaron ante el Registro de Votantes del Condado de Santa Clara argumentos a favor y en contra, y refutaciones a ambos. El argumento a favor fue firmado por el representante federal Sam Liccardo, la supervisora Margaret Abe-Koga, los Bomberos del Condado de Santa Clara (IAFF Local 1165), la Liga de Mujeres Votantes del Área de la Bahía y un enfermero de urgencias."
    },
    officialUrl: "https://vote.santaclaracounty.gov/list-local-measures-4"
  },
  {
    id: "la-D",
    letter: "D",
    body: {
      en: "City of Los Altos",
      es: "Ciudad de Los Altos"
    },
    scope: "city",
    appearsIn: ["los-altos"],
    allAddresses: true,
    kind: "initiative",
    threshold: "majority",
    placedBy: "petition",
    title: {
      en: "Requires voter approval for changes to downtown parking plazas",
      es: "Exige aprobación de los votantes para cambios en los estacionamientos del centro"
    },
    summary: {
      en: "This citizen initiative ordinance would bar the City from selling, leasing, conveying or declaring as surplus land its ten downtown parking plazas, or approving new uses or physical changes that would reduce protected trees or parking availability, access or convenience, unless a majority of voters approve. Two plazas could still be developed for affordable housing without a vote.",
      es: "Esta ordenanza de iniciativa ciudadana prohibiría que la Ciudad venda, arriende, traspase o declare como terreno excedente sus diez estacionamientos públicos del centro, o que apruebe nuevos usos o cambios físicos que reduzcan árboles protegidos o la disponibilidad, el acceso o la conveniencia del estacionamiento, a menos que lo apruebe la mayoría de los votantes. Dos estacionamientos aún podrían usarse para vivienda asequible sin una votación."
    },
    yes: {
      en: "The ordinance would be adopted: selling, leasing or changing the use of the ten downtown parking plazas would need voter approval, except affordable housing on two plazas.",
      es: "Se adoptaría la ordenanza: vender, arrendar o cambiar el uso de los diez estacionamientos del centro requeriría la aprobación de los votantes, excepto vivienda asequible en dos estacionamientos."
    },
    no: {
      en: "The ordinance would not be adopted; the City Council would keep its current authority over the downtown parking plazas.",
      es: "No se adoptaría la ordenanza; el Concejo Municipal mantendría su autoridad actual sobre los estacionamientos del centro."
    },
    debate: {
      en: "The initiative's proponents filed the argument in favor; an argument against and rebuttals to both were also filed with the City Clerk. The City also published an Elections Code 9212 impact report on the measure.",
      es: "Los proponentes de la iniciativa presentaron el argumento a favor; también se presentaron ante la Secretaría Municipal un argumento en contra y refutaciones a ambos. La Ciudad además publicó un informe de impacto sobre la medida según la sección 9212 del Código Electoral."
    },
    officialUrl: "https://www.losaltosca.gov/781/Citizen-Initiative-on-Downtown-Parking-P",
    placement: { cardId: "991a6bc8-1608-42b8-9063-24824af583bf", date: "2026-06-23", body: { en: "City Council", es: "Concejo Municipal" } }
  },
  {
    id: "mv-E",
    letter: "E",
    body: {
      en: "City of Mountain View",
      es: "Ciudad de Mountain View"
    },
    scope: "city",
    appearsIn: ["mountain-view"],
    allAddresses: true,
    kind: "charter",
    threshold: "majority",
    placedBy: "body",
    title: {
      en: "Updates City Charter language and procedures",
      es: "Actualiza el lenguaje y los procedimientos de la Carta Municipal"
    },
    summary: {
      en: "Amends the City Charter to use gender-neutral language, give the Council 60 days instead of 30 to act on filling a Council vacancy, end the requirement to read ordinances and resolutions in full, and let the Council set qualifications for boards, commissions and committees it creates. It also updates outdated terms and makes clarifying edits to match State law and current practice.",
      es: "Enmienda la Carta Municipal para usar lenguaje de género neutro, dar al Concejo 60 días en lugar de 30 para actuar sobre una vacante en el Concejo, eliminar el requisito de leer las ordenanzas y resoluciones completas, y permitir que el Concejo fije los requisitos para las juntas, comisiones y comités que cree. También actualiza términos obsoletos y hace aclaraciones para alinearse con la ley estatal y la práctica actual."
    },
    yes: {
      en: "The City Charter would be amended with these updates.",
      es: "Se enmendaría la Carta Municipal con estas actualizaciones."
    },
    no: {
      en: "The City Charter would stay as it is.",
      es: "La Carta Municipal se mantendría igual."
    },
    debate: {
      en: "An argument in favor was filed; no argument against was filed.",
      es: "Se presentó un argumento a favor; no se presentó ningún argumento en contra."
    },
    officialUrl: "https://vote.santaclaracounty.gov/list-local-measures-4"
  },
  {
    id: "mv-F",
    letter: "F",
    body: {
      en: "City of Mountain View",
      es: "Ciudad de Mountain View"
    },
    scope: "city",
    appearsIn: ["mountain-view"],
    allAddresses: true,
    kind: "tax",
    threshold: "majority",
    placedBy: "body",
    title: {
      en: "Raises maximum hotel tax rate to 15%",
      es: "Aumenta la tasa máxima del impuesto hotelero al 15%"
    },
    summary: {
      en: "Lets the City Council raise Mountain View's Transient Occupancy Tax, paid by hotel and short-term rental guests, from 10% up to 15%. It would raise up to $5.2 million a year for general city services, with independent audits, until ended by voters.",
      es: "Permite que el Concejo Municipal aumente el Impuesto de Ocupación Transitoria de Mountain View, que pagan los huéspedes de hoteles y alquileres de corto plazo, del 10% hasta un 15%. Recaudaría hasta $5.2 millones al año para servicios municipales generales, con auditorías independientes, hasta que los votantes lo terminen."
    },
    cost: {
      en: "Up to $5,200,000 a year (ballot question), paid by hotel and short-term rental guests.",
      es: "Hasta $5,200,000 al año (pregunta de la boleta), pagado por huéspedes de hoteles y alquileres de corto plazo."
    },
    yes: {
      en: "The City Council could raise the hotel tax from 10% up to 15%.",
      es: "El Concejo Municipal podría aumentar el impuesto hotelero del 10% hasta un 15%."
    },
    no: {
      en: "The hotel tax would stay at 10%.",
      es: "El impuesto hotelero se mantendría en 10%."
    },
    debate: {
      en: "An argument in favor was filed; it asks voters to join the City Council and the League of Women Voters of the Los Altos–Mountain View Area in voting yes. No argument against was filed.",
      es: "Se presentó un argumento a favor, que pide a los votantes unirse al Concejo Municipal y a la Liga de Mujeres Votantes del Área de Los Altos–Mountain View para votar sí. No se presentó ningún argumento en contra."
    },
    officialUrl: "https://vote.santaclaracounty.gov/list-local-measures-4"
  },
  {
    id: "echd-S",
    letter: "S",
    body: {
      en: "El Camino Healthcare District",
      es: "Distrito de Atención Médica El Camino"
    },
    scope: "special",
    appearsIn: ["santa-clara-county", "mountain-view", "los-altos", "los-altos-hills", "los-altos-school-district"],
    allAddresses: false,
    kind: "ordinance",
    threshold: "majority",
    placedBy: "body",
    title: {
      en: "Limits healthcare district directors to four terms",
      es: "Limita a cuatro períodos a los directores del distrito de salud"
    },
    summary: {
      en: "Amends the El Camino Healthcare District's bylaws to limit its board directors to four four-year terms.",
      es: "Enmienda los estatutos del Distrito de Atención Médica El Camino para limitar a sus directores a cuatro períodos de cuatro años."
    },
    yes: {
      en: "District directors would be limited to four four-year terms.",
      es: "Los directores del distrito estarían limitados a cuatro períodos de cuatro años."
    },
    no: {
      en: "The bylaws would not add this term limit.",
      es: "Los estatutos no agregarían este límite de períodos."
    },
    debate: {
      en: "An argument in favor was filed; no argument against was filed.",
      es: "Se presentó un argumento a favor; no se presentó ningún argumento en contra."
    },
    officialUrl: "https://vote.santaclaracounty.gov/list-local-measures-4"
  }
];

export const LOCAL_CONTESTS: LocalContest[] = [
  {
    jurisdiction: "san-francisco",
    office: {
      en: "Board of Supervisors",
      es: "Junta de Supervisores"
    },
    seats: {
      en: "5 seats: Districts 2, 4, 6, 8 and 10 (one each; only voters in those districts vote)",
      es: "5 escaños: Distritos 2, 4, 6, 8 y 10 (uno por distrito; solo votan los electores de esos distritos)"
    },
    officialUrl: "https://www.sf.gov/candidates-november-3-2026-general-election"
  },
  {
    jurisdiction: "san-francisco",
    office: {
      en: "Board of Education (SFUSD)",
      es: "Junta de Educación (SFUSD)"
    },
    seats: {
      en: "3 seats, citywide",
      es: "3 escaños, en toda la ciudad"
    },
    officialUrl: "https://www.sf.gov/candidates-november-3-2026-general-election"
  },
  {
    jurisdiction: "san-francisco",
    office: {
      en: "Community College Board",
      es: "Junta del Colegio Comunitario"
    },
    seats: {
      en: "3 seats (4-year terms) plus 1 seat for the remainder of a term ending January 8, 2029, citywide",
      es: "3 escaños (mandatos de 4 años) más 1 escaño por el resto de un mandato que termina el 8 de enero de 2029, en toda la ciudad"
    },
    officialUrl: "https://www.sf.gov/candidates-november-3-2026-general-election"
  },
  {
    jurisdiction: "san-francisco",
    office: {
      en: "Assessor-Recorder",
      es: "Asesor-Registrador"
    },
    seats: {
      en: "1 seat, citywide",
      es: "1 cargo, en toda la ciudad"
    },
    officialUrl: "https://www.sf.gov/candidates-november-3-2026-general-election"
  },
  {
    jurisdiction: "san-francisco",
    office: {
      en: "Public Defender",
      es: "Defensor Público"
    },
    seats: {
      en: "1 seat, citywide",
      es: "1 cargo, en toda la ciudad"
    },
    officialUrl: "https://www.sf.gov/candidates-november-3-2026-general-election"
  },
  {
    jurisdiction: "san-francisco",
    office: {
      en: "BART Board of Directors, District 8",
      es: "Junta Directiva de BART, Distrito 8"
    },
    seats: {
      en: "1 seat; only voters in BART District 8 (voters in BART Districts 7 and 9 do not have this contest)",
      es: "1 escaño; solo votan los electores del Distrito 8 de BART (los de los Distritos 7 y 9 no tienen esta contienda)"
    },
    officialUrl: "https://www.sf.gov/candidates-november-3-2026-general-election"
  },
  {
    jurisdiction: "santa-barbara-county",
    office: {
      en: "Board of Supervisors",
      es: "Junta de Supervisores"
    },
    seats: {
      en: "1 seat: District 5 (only District 5 voters)",
      es: "1 escaño: Distrito 5 (solo votan los electores del Distrito 5)"
    },
    officialUrl: "https://www.countyofsb.org/asset/99d7370f-5348-499d-8427-5fc01b995b7d"
  },
  {
    jurisdiction: "foster-city",
    office: {
      en: "Foster City City Council",
      es: "Concejo Municipal de Foster City"
    },
    seats: {
      en: "2 seats: District 1 and District 2 (1 each)",
      es: "2 puestos: Distrito 1 y Distrito 2 (1 cada uno)"
    },
    officialUrl: "https://smcacre.gov/system/files/2026-09/52_candidateroster0903.pdf"
  },
  {
    jurisdiction: "san-mateo-city",
    office: {
      en: "San Mateo City Council",
      es: "Concejo Municipal de San Mateo"
    },
    seats: {
      en: "3 seats: Districts 1, 3 and 5 (1 each)",
      es: "3 puestos: Distritos 1, 3 y 5 (1 cada uno)"
    },
    officialUrl: "https://smcacre.gov/system/files/2026-09/52_candidateroster0903.pdf"
  },
  {
    jurisdiction: "menlo-park",
    office: {
      en: "Menlo Park City Council",
      es: "Concejo Municipal de Menlo Park"
    },
    seats: {
      en: "3 seats: Districts 1, 2 and 4 (1 each)",
      es: "3 puestos: Distritos 1, 2 y 4 (1 cada uno)"
    },
    officialUrl: "https://smcacre.gov/system/files/2026-09/52_candidateroster0903.pdf"
  },
  {
    jurisdiction: "redwood-city",
    office: {
      en: "Redwood City City Council",
      es: "Concejo Municipal de Redwood City"
    },
    seats: {
      en: "3 seats: Districts 2, 5 and 6 (1 each)",
      es: "3 puestos: Distritos 2, 5 y 6 (1 cada uno)"
    },
    officialUrl: "https://smcacre.gov/system/files/2026-09/52_candidateroster0903.pdf"
  },
  {
    jurisdiction: "east-palo-alto",
    office: {
      en: "East Palo Alto City Council",
      es: "Concejo Municipal de East Palo Alto"
    },
    seats: {
      en: "2 seats, citywide (vote for 2)",
      es: "2 puestos, en toda la ciudad (vote por 2)"
    },
    officialUrl: "https://smcacre.gov/system/files/2026-09/52_candidateroster0903.pdf"
  },
  {
    jurisdiction: "san-mateo-county",
    office: {
      en: "Board of Supervisors, District 5 (short term)",
      es: "Junta de Supervisores, Distrito 5 (periodo corto)"
    },
    seats: {
      en: "1 seat (short term); District 5 voters only",
      es: "1 puesto (periodo corto); solo votantes del Distrito 5"
    },
    officialUrl: "https://smcacre.gov/system/files/2026-09/52_candidateroster0903.pdf"
  },
  {
    jurisdiction: "mountain-view",
    office: {
      en: "Mountain View City Council (at-large)",
      es: "Concejo Municipal de Mountain View (en general)"
    },
    seats: {
      en: "3 seats (four-year terms); no eligible incumbents running",
      es: "3 puestos (períodos de cuatro años); ningún titular elegible se postula"
    },
    officialUrl: "https://www.mountainview.gov/home/showpublisheddocument/13616/639213782869200000"
  }
];

/** The county a covered jurisdiction votes in; counties map to themselves. */
export function countyFor(slug: JurisdictionSlug): CountySlug {
  if ((COUNTY_ORDER as string[]).includes(slug)) return slug as CountySlug;
  const option = getPublicJurisdictionOptions().find(
    (candidate) => toInternalJurisdictionSlug(candidate.slug) === slug
  );
  const parent = toInternalJurisdictionSlug(option?.parentCountySlug);
  if (!parent || !(COUNTY_ORDER as string[]).includes(parent)) {
    throw new Error(`No county configured for ${slug}`);
  }
  return parent as CountySlug;
}

function jurisdictionsIn(county: CountySlug): JurisdictionSlug[] {
  return getPublicJurisdictionOptions()
    .map((option) => toInternalJurisdictionSlug(option.slug) as JurisdictionSelection)
    .filter(
      (slug): slug is JurisdictionSlug =>
        slug !== ALL_JURISDICTIONS_SLUG && countyFor(slug) === county
    );
}

function byScopeThenLetter(a: LocalMeasure, b: LocalMeasure) {
  return (
    SCOPE_ORDER.indexOf(a.scope) - SCOPE_ORDER.indexOf(b.scope) ||
    a.body.en.localeCompare(b.body.en) ||
    (a.letter || "").localeCompare(b.letter || "")
  );
}

export type BallotSection = {
  county: CountySlug;
  contests: LocalContest[];
  measures: LocalMeasure[];
};

/**
 * The local part of the ballot for a selection. A city or district gets the
 * measures its voters see; a county also gets every covered city's measures
 * and races; "all" gets one section per county.
 */
export function getBallotFor(
  selection: JurisdictionSelection,
  measures: LocalMeasure[] = LOCAL_MEASURES,
  contests: LocalContest[] = LOCAL_CONTESTS
): BallotSection[] {
  if (selection === ALL_JURISDICTIONS_SLUG) {
    return COUNTY_ORDER.flatMap((county) => getBallotFor(county, measures, contests));
  }

  const county = countyFor(selection);
  const places = selection === county ? jurisdictionsIn(county) : [selection];

  return [
    {
      county,
      contests: contests.filter((contest) => places.includes(contest.jurisdiction)),
      measures: measures
        .filter((measure) => measure.appearsIn.some((slug) => places.includes(slug)))
        .sort(byScopeThenLetter)
    }
  ];
}
