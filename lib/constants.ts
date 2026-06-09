import {
  Bike,
  BriefcaseBusiness,
  Building2,
  CircleDollarSign,
  GraduationCap,
  Home,
  ShieldCheck,
  Trees
} from "lucide-react";

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

export type CategoryName = (typeof CATEGORIES)[number];

export const CATEGORY_DEFINITIONS: Record<
  CategoryName,
  {
    slug: string;
    description: string;
    tone: string;
    icon: typeof Home;
  }
> = {
  Housing: {
    slug: "housing",
    description: "Rent, affordable homes, zoning, and decisions that shape where people can live.",
    tone: "bg-[#f3d8cf] text-[#6e2f21] border-[#d9a18f]",
    icon: Home
  },
  Transportation: {
    slug: "transportation",
    description: "Roads, bike lanes, parking, transit, traffic safety, and how people move around town.",
    tone: "bg-[#dce9f7] text-[#204f8f] border-[#9ab9df]",
    icon: Bike
  },
  "Public Safety": {
    slug: "public-safety",
    description: "Police, fire, emergency response, disaster planning, and neighborhood safety.",
    tone: "bg-[#f8e4b8] text-[#755415] border-[#d4ac52]",
    icon: ShieldCheck
  },
  "Parks & Environment": {
    slug: "parks-environment",
    description: "Parks, waterfronts, climate work, trees, open space, and environmental protections.",
    tone: "bg-[#dcebd5] text-[#35591f] border-[#9fbe82]",
    icon: Trees
  },
  "Budget & Taxes": {
    slug: "budget-taxes",
    description: "City spending, fees, taxes, bonds, contracts, and the tradeoffs behind public money.",
    tone: "bg-[#efe2c3] text-[#654812] border-[#cbb06d]",
    icon: CircleDollarSign
  },
  "Business & Development": {
    slug: "business-development",
    description: "New buildings, local businesses, economic development, permits, and major projects.",
    tone: "bg-[#dbe8e4] text-[#1f5a52] border-[#8eb9ad]",
    icon: BriefcaseBusiness
  },
  "Schools & Youth": {
    slug: "schools-youth",
    description: "Youth programs, school partnerships, students, childcare, and family-facing services.",
    tone: "bg-[#e5ddf1] text-[#523978] border-[#b6a2d1]",
    icon: GraduationCap
  },
  "City Services": {
    slug: "city-services",
    description: "Utilities, public works, permits, libraries, maintenance, and everyday city operations.",
    tone: "bg-[#d8e4e9] text-[#245363] border-[#91b3bf]",
    icon: Building2
  }
};

export const STATUS_TONES: Record<string, string> = {
  "Upcoming vote": "bg-civic/10 text-civic border-civic/30",
  "Under discussion": "bg-harbor/10 text-harbor border-harbor/30",
  Passed: "bg-moss/10 text-moss border-moss/30",
  Tabled: "bg-sun/20 text-[#73561a] border-sun/40",
  Cancelled: "bg-clay/10 text-clay border-clay/30",
  "Information only": "bg-black/5 text-black/70 border-black/20",
  Upcoming: "bg-civic/10 text-civic border-civic/30",
  Past: "bg-black/5 text-black/70 border-black/20"
};
