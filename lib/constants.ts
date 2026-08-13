import {
  Bike,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CircleDollarSign,
  Gavel,
  GraduationCap,
  HandCoins,
  HeartPulse,
  Home,
  MapPinned,
  School,
  ShieldCheck,
  Trees,
  UserRoundCog,
  UsersRound
} from "lucide-react";

export const DECISION_CARD_PAGE_SIZE = 12;

export const CATEGORIES = [
  "Housing",
  "Transportation",
  "Public Safety",
  "Parks & Environment",
  "Budget & Taxes",
  "Business & Development",
  "Schools & Youth",
  "City Services"
] as const;

export const SCHOOL_CATEGORIES = [
  "Teaching & Learning",
  "Students & Families",
  "School Buildings & Grounds",
  "School Funding",
  "Teachers & Staff",
  "Safety & Wellness",
  "Enrollment & Boundaries",
  "Board & Administration"
] as const;

export const ALL_CATEGORIES = [...CATEGORIES, ...SCHOOL_CATEGORIES] as const;

export type CategoryName = (typeof ALL_CATEGORIES)[number];
export type SchoolCategoryName = (typeof SCHOOL_CATEGORIES)[number];

export const CATEGORY_DEFINITIONS: Record<
  CategoryName,
  {
    slug: string;
    description: string;
    icon: typeof Home;
  }
> = {
  Housing: {
    slug: "housing",
    description: "Rent, affordable homes, zoning, and decisions that shape where people can live.",
    icon: Home
  },
  Transportation: {
    slug: "transportation",
    description: "Roads, bike lanes, parking, transit, traffic safety, and how people move around town.",
    icon: Bike
  },
  "Public Safety": {
    slug: "public-safety",
    description: "Police, fire, emergency response, disaster planning, and neighborhood safety.",
    icon: ShieldCheck
  },
  "Parks & Environment": {
    slug: "parks-environment",
    description: "Parks, waterfronts, climate work, trees, open space, and environmental protections.",
    icon: Trees
  },
  "Budget & Taxes": {
    slug: "budget-taxes",
    description: "Public spending, fees, taxes, bonds, contracts, and the tradeoffs behind public money.",
    icon: CircleDollarSign
  },
  "Business & Development": {
    slug: "business-development",
    description: "New buildings, local businesses, economic development, permits, and major projects.",
    icon: BriefcaseBusiness
  },
  "Schools & Youth": {
    slug: "schools-youth",
    description: "Youth programs, school partnerships, students, childcare, and family-facing services.",
    icon: GraduationCap
  },
  "City Services": {
    slug: "city-services",
    description: "Utilities, public works, permits, libraries, maintenance, and everyday local government operations.",
    icon: Building2
  },
  "Teaching & Learning": {
    slug: "teaching-learning",
    description: "Curriculum, instruction, academic programs, assessments, and classroom learning.",
    icon: BookOpen
  },
  "Students & Families": {
    slug: "students-families",
    description: "Student services, family support, meals, childcare, and school-community programs.",
    icon: UsersRound
  },
  "School Buildings & Grounds": {
    slug: "school-buildings-grounds",
    description: "Classrooms, campuses, playgrounds, construction, repairs, and school grounds.",
    icon: School
  },
  "School Funding": {
    slug: "school-funding",
    description: "District budgets, parcel taxes, bonds, grants, spending, and financial planning.",
    icon: HandCoins
  },
  "Teachers & Staff": {
    slug: "teachers-staff",
    description: "Hiring, compensation, labor agreements, professional development, and district employees.",
    icon: UserRoundCog
  },
  "Safety & Wellness": {
    slug: "safety-wellness",
    description: "Campus safety, emergency planning, physical health, mental health, and student wellness.",
    icon: HeartPulse
  },
  "Enrollment & Boundaries": {
    slug: "enrollment-boundaries",
    description: "Enrollment, attendance areas, school assignments, transfers, and boundary changes.",
    icon: MapPinned
  },
  "Board & Administration": {
    slug: "board-administration",
    description: "Board governance, superintendent matters, district policies, and central administration.",
    icon: Gavel
  }
};

export const STATUS_TONES: Record<string, string> = {
  "Upcoming vote": "state--upcoming",
  "Routine approval": "state--decided",
  "Under discussion": "state--decided",
  Passed: "state--affirm",
  Tabled: "state--decided",
  Cancelled: "state--alert",
  "Information only": "state--decided",
  Upcoming: "state--upcoming",
  Past: "state--decided"
};
