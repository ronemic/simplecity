// Hand-written plain-language summaries of the November 3, 2026 California
// statewide propositions. Every fact here is checked against the Secretary of
// State's Official Voter Information Guide (titles, summaries, fiscal impact,
// and "what your vote means"); Spanish titles are the official ones from the
// Spanish edition of the guide. Campaign claims are labeled as such.

export type Localized = { en: string; es: string };

export type Proposition = {
  number: number;
  title: Localized;
  origin: "legislature" | "initiative";
  summary: Localized;
  cost: Localized;
  yes: Localized;
  no: Localized;
  debate?: Localized;
};

export type PropositionGroup = {
  id: "housing" | "taxes" | "voting" | "health";
  heading: Localized;
  note?: Localized;
  propositions: Proposition[];
};

export const ELECTION_DATES = {
  ballotsMailed: { en: "October 5, 2026", es: "5 de octubre de 2026" },
  registrationDeadline: { en: "October 19, 2026", es: "19 de octubre de 2026" },
  electionDay: { en: "November 3, 2026", es: "3 de noviembre de 2026" }
};

export const OFFICIAL_GUIDE_URL: Localized = {
  en: "https://voterguide.sos.ca.gov/propositions/",
  es: "https://vig.cdn.sos.ca.gov/2026/general/es/pdf/complete-vig.pdf"
};

// The Spanish guide is only published as one PDF, so Spanish readers get that.
export function officialPropositionUrl(number: number, locale: "en" | "es") {
  return locale === "es"
    ? OFFICIAL_GUIDE_URL.es
    : `https://voterguide.sos.ca.gov/propositions/${number}/`;
}

// The homepage points here until polls close (8pm Pacific, November 3).
const ELECTION_PROMO_ENDS_AT = Date.parse("2026-11-04T04:00:00Z");

export function isElectionPromoActive(now = Date.now()) {
  return now < ELECTION_PROMO_ENDS_AT;
}

export const PROPOSITION_GROUPS: PropositionGroup[] = [
  {
    id: "housing",
    heading: { en: "Housing and development", es: "Vivienda y desarrollo" },
    propositions: [
      {
        number: 1,
        title: {
          en: "Authorizes bonds for housing affordability programs",
          es: "Autoriza bonos para programas de vivienda asequible"
        },
        origin: "legislature",
        summary: {
          en: "The state would borrow $11.25 billion for affordable housing: multifamily rental housing, mortgages for veterans, supportive housing, preserving existing affordable homes, and down-payment help.",
          es: "El estado pediría prestados $11.25 mil millones para vivienda asequible: viviendas multifamiliares de alquiler, préstamos hipotecarios para veteranos, viviendas con servicios de apoyo, preservación de viviendas asequibles existentes y ayuda para el pago inicial."
        },
        cost: {
          en: "About $500–600 million a year for about 25 years to repay the bonds.",
          es: "Entre $500 y $600 millones al año durante unos 25 años para pagar los bonos."
        },
        yes: {
          en: "The state could borrow $11.25 billion for veterans and affordable housing.",
          es: "El estado podría pedir prestados $11.25 mil millones para veteranos y vivienda asequible."
        },
        no: {
          en: "The state could not borrow the $11.25 billion.",
          es: "El estado no podría pedir prestados los $11.25 mil millones."
        },
        debate: {
          en: "No argument against it was submitted for the voter guide.",
          es: "No se presentó ningún argumento en contra para la guía electoral."
        }
      },
      {
        number: 37,
        title: {
          en: "Creates loan program for middle-income buyers of qualified new homes",
          es: "Crea un programa de préstamos para compradores de ingresos medios de viviendas nuevas calificadas"
        },
        origin: "initiative",
        summary: {
          en: "Creates a state program, funded by up to $25 billion in bonds, that lends buyers up to 17% of the price of a newly built home priced below about $1.5 million. Buyers must be California residents, live in the home, meet income limits, and put at least 3% down.",
          es: "Crea un programa estatal, financiado con hasta $25 mil millones en bonos, que presta a compradores hasta el 17 % del precio de una vivienda nueva de menos de aproximadamente $1.5 millones. Los compradores deben residir en California, vivir en la vivienda, cumplir límites de ingresos y pagar al menos un 3 % de enganche."
        },
        cost: {
          en: "No direct state or local cost. Homeowners' loan payments repay the bonds, not taxpayers.",
          es: "Sin costo directo para el estado ni los gobiernos locales. Los pagos de los préstamos de los propietarios reembolsan los bonos, no los contribuyentes."
        },
        yes: {
          en: "The state would create the new homebuying program.",
          es: "El estado crearía el nuevo programa de compra de vivienda."
        },
        no: {
          en: "The state would not be required to create the program.",
          es: "El estado no estaría obligado a crear el programa."
        },
        debate: {
          en: "No argument against it was submitted for the voter guide.",
          es: "No se presentó ningún argumento en contra para la guía electoral."
        }
      },
      {
        number: 45,
        title: {
          en: "Modifies environmental review for certain projects",
          es: "Modifica la revisión ambiental para ciertos proyectos"
        },
        origin: "initiative",
        summary: {
          en: "Changes the California Environmental Quality Act (CEQA) for many housing, transportation, water, and health projects. It sets deadlines to finish environmental review and resolve lawsuits, and narrows what courts can consider when a project is challenged.",
          es: "Modifica la Ley de Calidad Ambiental de California (CEQA) para muchos proyectos de vivienda, transporte, agua y salud. Fija plazos para terminar la revisión ambiental y resolver demandas, y limita lo que los tribunales pueden considerar cuando se impugna un proyecto."
        },
        cost: {
          en: "Likely high tens of millions of dollars a year at first (possibly over $100 million), partly covered by fees. Long-term effects are uncertain.",
          es: "Probablemente decenas de millones de dólares al año al principio (posiblemente más de $100 millones), cubiertos en parte por tarifas. Los efectos a largo plazo son inciertos."
        },
        yes: {
          en: "Eligible projects would get faster review deadlines and narrower court challenges.",
          es: "Los proyectos elegibles tendrían plazos de revisión más cortos e impugnaciones judiciales más limitadas."
        },
        no: {
          en: "Projects would keep using today's review and court challenge process.",
          es: "Los proyectos seguirían usando el proceso actual de revisión e impugnación judicial."
        },
        debate: {
          en: "Supporters say it cuts red tape and lowers costs. Opponents, including environmental groups, say it weakens environmental and public review.",
          es: "Los partidarios dicen que reduce trámites y costos. Los opositores, incluidos grupos ambientalistas, dicen que debilita la revisión ambiental y pública."
        }
      }
    ]
  },
  {
    id: "taxes",
    heading: { en: "Taxes and the state budget", es: "Impuestos y presupuesto estatal" },
    note: {
      en: "Props 40, 41, and 42 are connected. Prop 40 is a tax on wealth whose revenue is exempt from the state spending limit. Props 41 and 42 each cancel taxes passed after January 1, 2026 that have those features, so the Yes on 40 campaign opposes them as attempts to undo Prop 40. Supporters of 41 and 42 describe them as accountability and protection for savings.",
      es: "Las Propuestas 40, 41 y 42 están relacionadas. La Propuesta 40 es un impuesto sobre el patrimonio cuyos ingresos quedan exentos del límite de gasto estatal. Las Propuestas 41 y 42 anulan impuestos aprobados después del 1 de enero de 2026 que tengan esas características, por lo que la campaña a favor de la 40 se opone a ellas como intentos de deshacer la Propuesta 40. Sus partidarios las describen como rendición de cuentas y protección de los ahorros."
    },
    propositions: [
      {
        number: 2,
        title: {
          en: "Increases state's Rainy Day Fund",
          es: "Aumenta el Fondo de Reserva del estado"
        },
        origin: "legislature",
        summary: {
          en: "Changes the rules so the state builds bigger budget reserves for downturns and keeps making extra debt payments for longer. This is a constitutional amendment.",
          es: "Cambia las normas para que el estado acumule reservas presupuestarias más grandes para las recesiones y siga haciendo pagos adicionales de deuda durante más tiempo. Es una enmienda constitucional."
        },
        cost: {
          en: "State budget reserves would be higher.",
          es: "Las reservas presupuestarias del estado serían mayores."
        },
        yes: {
          en: "Reserve and debt-payment rules change, and reserves grow.",
          es: "Cambian las normas de reservas y pago de deuda, y las reservas aumentan."
        },
        no: {
          en: "Reserve and debt-payment rules stay the same.",
          es: "Las normas de reservas y pago de deuda no cambian."
        },
        debate: {
          en: "Supporters say it doubles the Rainy Day Fund. Opponents say it creates a loophole around the spending limit that makes taxpayer rebates less likely.",
          es: "Los partidarios dicen que duplica el Fondo de Reserva. Los opositores dicen que crea una laguna en el límite de gasto que reduce la probabilidad de devoluciones a los contribuyentes."
        }
      },
      {
        number: 3,
        title: {
          en: "Provides permanent funding for schools and health care by extending existing tax on high incomes",
          es: "Proporciona financiamiento permanente para las escuelas y la atención médica extendiendo el impuesto existente sobre los ingresos altos"
        },
        origin: "initiative",
        summary: {
          en: "Higher income tax rates on people earning over about $371,000 (adjusted for inflation) have been in place since 2012 and are set to expire in 2031. This makes them permanent and directs the money to public education.",
          es: "Las tasas más altas del impuesto sobre la renta para personas con ingresos de más de unos $371,000 (ajustados por inflación) están vigentes desde 2012 y vencen en 2031. Esta medida las hace permanentes y destina los ingresos a la educación pública."
        },
        cost: {
          en: "Keeps $5–15 billion a year in state revenue that would otherwise end after 2031.",
          es: "Mantiene entre $5 mil y $15 mil millones al año en ingresos estatales que de otro modo terminarían después de 2031."
        },
        yes: {
          en: "The tax increase on high earners becomes permanent.",
          es: "El aumento de impuestos a las personas con ingresos altos se vuelve permanente."
        },
        no: {
          en: "The tax increase expires in 2031.",
          es: "El aumento de impuestos vence en 2031."
        },
        debate: {
          en: "Supported by teachers' groups and the PTA. Opposed by taxpayer and business groups.",
          es: "Apoyada por grupos de maestros y la PTA. Rechazada por grupos de contribuyentes y empresariales."
        }
      },
      {
        number: 40,
        title: {
          en: "Imposes one-time tax on certain taxpayers",
          es: "Impone un impuesto por única vez a ciertos contribuyentes"
        },
        origin: "initiative",
        summary: {
          en: "A one-time tax of 5% of wealth on certain taxpayers with assets over $1 billion, with the money going mainly to health care. The revenue would not count toward the school-funding guarantee or the state spending limit.",
          es: "Un impuesto por única vez del 5 % del patrimonio a ciertos contribuyentes con activos de más de $1,000 millones, destinado principalmente a la atención médica. Los ingresos no contarían para la garantía de financiamiento escolar ni para el límite de gasto estatal."
        },
        cost: {
          en: "Tens of billions of dollars in temporary revenue spread over several years. Possibly less than $1 billion a year in lost income tax revenue from billionaires going forward.",
          es: "Decenas de miles de millones de dólares en ingresos temporales repartidos en varios años. Posiblemente menos de $1,000 millones al año en pérdida de ingresos del impuesto sobre la renta de multimillonarios en el futuro."
        },
        yes: {
          en: "The state collects a one-time 5% tax on billionaires' wealth.",
          es: "El estado cobra un impuesto por única vez del 5 % sobre el patrimonio de los multimillonarios."
        },
        no: {
          en: "The state does not collect the tax.",
          es: "El estado no cobra el impuesto."
        },
        debate: {
          en: "Supported by Sen. Bernie Sanders and SEIU United Healthcare Workers West. Opponents include the California Teachers Association, school boards, and business groups.",
          es: "Apoyada por el senador Bernie Sanders y SEIU United Healthcare Workers West. Entre los opositores están la Asociación de Maestros de California, juntas escolares y grupos empresariales."
        }
      },
      {
        number: 41,
        title: {
          en: "Prohibits new state taxes that exclude revenues from state spending limit; requires audits for new state special taxes",
          es: "Prohíbe nuevos impuestos estatales que excluyan sus ingresos del límite de gasto estatal; exige auditorías para los nuevos impuestos especiales estatales"
        },
        origin: "initiative",
        summary: {
          en: "The State Auditor would review programs funded by proposed special taxes before they reach the ballot, and keep reviewing programs funded by new special taxes. It also cancels state taxes passed after January 1, 2026 whose revenue is exempt from the voter-approved spending limit.",
          es: "El Auditor Estatal revisaría los programas financiados por impuestos especiales propuestos antes de que lleguen a la boleta, y seguiría revisando los programas financiados por nuevos impuestos especiales. También anula los impuestos estatales aprobados después del 1 de enero de 2026 cuyos ingresos estén exentos del límite de gasto aprobado por los votantes."
        },
        cost: {
          en: "Unknown. It depends on future decisions by voters and lawmakers.",
          es: "Desconocido. Depende de futuras decisiones de los votantes y legisladores."
        },
        yes: {
          en: "New audits of special-tax programs, and new special-tax spending may not be exempt from the spending limit.",
          es: "Nuevas auditorías de programas de impuestos especiales, y el gasto de nuevos impuestos especiales podría no quedar exento del límite de gasto."
        },
        no: {
          en: "Audit duties and spending-limit rules stay the same.",
          es: "Las funciones de auditoría y las normas del límite de gasto no cambian."
        }
      },
      {
        number: 42,
        title: {
          en: "Prohibits new state personal property taxes and certain retroactive state taxes",
          es: "Prohíbe nuevos impuestos estatales sobre los bienes personales y ciertos impuestos estatales retroactivos"
        },
        origin: "initiative",
        summary: {
          en: "Bans any new state tax on owning personal property (anything other than real estate, including financial assets) and any new state tax that applies retroactively. It cancels conflicting taxes passed after January 1, 2026.",
          es: "Prohíbe cualquier nuevo impuesto estatal sobre la propiedad de bienes personales (todo lo que no sea bienes raíces, incluidos los activos financieros) y cualquier nuevo impuesto estatal retroactivo. Anula los impuestos contradictorios aprobados después del 1 de enero de 2026."
        },
        cost: {
          en: "Tax revenue may not grow as much in the future.",
          es: "Es posible que los ingresos fiscales no aumenten tanto en el futuro."
        },
        yes: {
          en: "The state could not create new taxes on owning financial assets or other personal property.",
          es: "El estado no podría crear nuevos impuestos sobre la propiedad de activos financieros u otros bienes personales."
        },
        no: {
          en: "The state keeps the option to create such taxes.",
          es: "El estado conserva la opción de crear esos impuestos."
        }
      },
      {
        number: 43,
        title: {
          en: "Limits voters' ability to raise revenues for local government services",
          es: "Limita la capacidad de los votantes para aumentar los ingresos destinados a los servicios de los gobiernos locales"
        },
        origin: "legislature",
        summary: {
          en: "Starting January 1, 2027, local special taxes that voters put on the ballot by petition would need two-thirds approval instead of a simple majority. This is a constitutional amendment.",
          es: "A partir del 1 de enero de 2027, los impuestos especiales locales que los votantes pongan en la boleta mediante petición necesitarían la aprobación de dos tercios en lugar de una mayoría simple. Es una enmienda constitucional."
        },
        cost: {
          en: "Local tax revenue may not grow as much in the future.",
          es: "Es posible que los ingresos fiscales locales no aumenten tanto en el futuro."
        },
        yes: {
          en: "Certain local taxes would need two-thirds voter approval.",
          es: "Ciertos impuestos locales necesitarían la aprobación de dos tercios de los votantes."
        },
        no: {
          en: "Those local taxes could still pass with a majority vote.",
          es: "Esos impuestos locales podrían seguir aprobándose por mayoría."
        },
        debate: {
          en: "Supporters say it restores Prop 13's two-thirds rule. Opponents, including firefighters, teachers, and nurses, say it lets one-third of voters block local services.",
          es: "Los partidarios dicen que restablece la regla de dos tercios de la Propuesta 13. Los opositores, incluidos bomberos, maestros y enfermeros, dicen que permite que un tercio de los votantes bloquee servicios locales."
        }
      }
    ]
  },
  {
    id: "voting",
    heading: { en: "Elections and voting", es: "Elecciones y votación" },
    propositions: [
      {
        number: 4,
        title: {
          en: "Repeals prohibition against public funding of election campaigns",
          es: "Deroga la prohibición del financiamiento público de las campañas electorales"
        },
        origin: "legislature",
        summary: {
          en: "Lifts California's ban on state and local governments offering public money to candidates' campaigns. These programs could not use money set aside for education, transportation, or public safety.",
          es: "Elimina la prohibición de que los gobiernos estatales y locales den dinero público a las campañas de candidatos. Estos programas no podrían usar fondos destinados a educación, transporte o seguridad pública."
        },
        cost: {
          en: "A few hundred thousand dollars a year for the state's ethics commission to answer questions about these programs.",
          es: "Unos pocos cientos de miles de dólares al año para que la comisión de ética del estado responda preguntas sobre estos programas."
        },
        yes: {
          en: "State and local governments could create public campaign financing programs, with limits.",
          es: "Los gobiernos estatales y locales podrían crear programas de financiamiento público de campañas, con límites."
        },
        no: {
          en: "The state and most local governments still could not create these programs.",
          es: "El estado y la mayoría de los gobiernos locales seguirían sin poder crear estos programas."
        },
        debate: {
          en: "Supporters say California is the only state with this ban. Opponents say it spends taxpayer money on politicians' campaigns.",
          es: "Los partidarios dicen que California es el único estado con esta prohibición. Los opositores dicen que gasta dinero de los contribuyentes en campañas de políticos."
        }
      },
      {
        number: 5,
        title: {
          en: "Changes recall election process for statewide officers",
          es: "Modifica el proceso electoral de destitución de los funcionarios estatales"
        },
        origin: "legislature",
        summary: {
          en: "Recall ballots would no longer ask voters who should replace the official. If an official is recalled, the seat would be filled later by a special election or by appointment, depending on the office. This is a constitutional amendment.",
          es: "Las boletas de destitución ya no preguntarían quién debe reemplazar al funcionario. Si se destituye a un funcionario, el cargo se llenaría después mediante una elección especial o un nombramiento, según el cargo. Es una enmienda constitucional."
        },
        cost: {
          en: "Unknown. If a recall happens, it could save or cost millions depending on the office.",
          es: "Desconocido. Si hay una destitución, podría ahorrar o costar millones según el cargo."
        },
        yes: {
          en: "No replacement question on recall ballots; vacancies filled by special election or appointment.",
          es: "Sin pregunta de reemplazo en las boletas de destitución; las vacantes se llenan por elección especial o nombramiento."
        },
        no: {
          en: "Voters keep choosing a replacement on the same recall ballot.",
          es: "Los votantes siguen eligiendo un reemplazo en la misma boleta de destitución."
        },
        debate: {
          en: "Supporters say replacements can currently win with a small share of the vote. Opponents say politicians, not voters, would pick replacements for statewide offices.",
          es: "Los partidarios dicen que hoy un reemplazo puede ganar con una pequeña parte del voto. Los opositores dicen que los políticos, no los votantes, elegirían a los reemplazos de los cargos estatales."
        }
      },
      {
        number: 39,
        title: {
          en: "Prohibits citizens from voting unless they present government-issued identification",
          es: "Prohíbe que los ciudadanos voten a menos que presenten una identificación emitida por el gobierno"
        },
        origin: "initiative",
        summary: {
          en: "In-person voters would have to show government-issued ID. Mail ballots would not count unless the envelope includes the last four digits of a designated government ID number. This is a constitutional amendment.",
          es: "Quienes voten en persona tendrían que mostrar una identificación emitida por el gobierno. Las boletas por correo no contarían a menos que el sobre incluya los últimos cuatro dígitos de un número de identificación gubernamental designado. Es una enmienda constitucional."
        },
        cost: {
          en: "Tens of millions to low hundreds of millions of dollars a year.",
          es: "Entre decenas y unos pocos cientos de millones de dólares al año."
        },
        yes: {
          en: "Voters would provide ID information every time they vote.",
          es: "Los votantes darían información de identificación cada vez que voten."
        },
        no: {
          en: "Voters' identity would still be confirmed by their signature.",
          es: "La identidad de los votantes se seguiría confirmando con su firma."
        },
        debate: {
          en: "Supporters say it increases trust in elections. Opponents, including the ACLU and League of Women Voters, say it could block eligible voters.",
          es: "Los partidarios dicen que aumenta la confianza en las elecciones. Los opositores, como la ACLU y la Liga de Mujeres Votantes, dicen que podría impedir votar a personas elegibles."
        }
      }
    ]
  },
  {
    id: "health",
    heading: { en: "Health and research", es: "Salud e investigación" },
    propositions: [
      {
        number: 38,
        title: {
          en: "Authorizes bonds for immunology medical research",
          es: "Autoriza bonos para la investigación médica en inmunología"
        },
        origin: "initiative",
        summary: {
          en: "The state would borrow $8.4 billion for immunology and immunotherapy research: half to a single University of California-affiliated nonprofit research institute, and half to research grants.",
          es: "El estado pediría prestados $8.4 mil millones para investigación en inmunología e inmunoterapia: la mitad para un solo instituto de investigación sin fines de lucro afiliado a la Universidad de California y la otra mitad para subvenciones de investigación."
        },
        cost: {
          en: "About $500–600 million a year for about 20 years, possibly offset if the research earns revenue.",
          es: "Entre $500 y $600 millones al año durante unos 20 años, posiblemente compensados si la investigación genera ingresos."
        },
        yes: {
          en: "The state could borrow $8.4 billion for this research.",
          es: "El estado podría pedir prestados $8.4 mil millones para esta investigación."
        },
        no: {
          en: "The state could not borrow the $8.4 billion.",
          es: "El estado no podría pedir prestados los $8.4 mil millones."
        },
        debate: {
          en: "Supported by groups including the Michael J. Fox Foundation. The opposing argument says research funding belongs in the normal budget process, not decades of bond debt.",
          es: "Apoyada por grupos como la Fundación Michael J. Fox. El argumento en contra dice que la investigación debe financiarse en el presupuesto normal, no con décadas de deuda en bonos."
        }
      },
      {
        number: 44,
        title: {
          en: "Requires community health clinics spend 90% of revenue on program services",
          es: "Exige que las clínicas de salud comunitarias destinen el 90 % de sus ingresos a servicios del programa"
        },
        origin: "initiative",
        summary: {
          en: "Penalizes nonprofit community health centers (clinics serving medically underserved areas) that spend less than 90% of their revenue on \"program services,\" including but not limited to patient care.",
          es: "Sanciona a los centros de salud comunitarios sin fines de lucro (clínicas que atienden zonas con poca atención médica) que gasten menos del 90 % de sus ingresos en \"servicios del programa\", incluida, entre otros, la atención a pacientes."
        },
        cost: {
          en: "Low tens of millions of dollars a year in state costs, covered by fees.",
          es: "Unas pocas decenas de millones de dólares al año en costos estatales, cubiertos por tarifas."
        },
        yes: {
          en: "Certain nonprofit clinics must spend at least 90% of revenue each year on health care services.",
          es: "Ciertas clínicas sin fines de lucro deben gastar al menos el 90 % de sus ingresos cada año en servicios de salud."
        },
        no: {
          en: "The new spending requirement does not take effect.",
          es: "El nuevo requisito de gasto no entra en vigor."
        },
        debate: {
          en: "The Yes campaign is run by SEIU United Healthcare Workers West. Opponents, including the California Medical Association and pediatricians, say clinics would close.",
          es: "La campaña a favor la dirige SEIU United Healthcare Workers West. Los opositores, como la Asociación Médica de California y pediatras, dicen que cerrarían clínicas."
        }
      }
    ]
  }
];
